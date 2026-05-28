from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.rag.retriever import retrieve
from backend.chat.memory import get_history, save_turn
from backend.database import get_db
from backend.config import settings
from datetime import datetime
import litellm
import httpx
import json
import time
from backend.mcp_client.utils import get_all_mcp_tools, execute_mcp_tool

router = APIRouter()

class AskRequest(BaseModel):
    question: str
    model: str = None
    use_documents: bool = True

class AskResponse(BaseModel):
    answer: str
    sources: list[dict]
    model_used: str = ""

def _get_team_monthly_usage(db, team_id: int) -> int:
    """Get total tokens used by a team in the current calendar month"""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    row = db.execute(
        "SELECT COALESCE(SUM(tokens_used), 0) as total FROM usage_logs WHERE team_id = ? AND created_at >= ?",
        (team_id, month_start)
    ).fetchone()
    return row["total"]

def _get_team_limit(db, team_id: int) -> int:
    """Get the team's monthly token limit"""
    row = db.execute("SELECT token_limit FROM teams WHERE id = ?", (team_id,)).fetchone()
    return row["token_limit"] if row and row["token_limit"] else 100000

@router.get("/models")
def list_models():
    """List available Ollama models"""
    try:
        response = httpx.get(f"{settings.OLLAMA_URL}/api/tags", timeout=5.0)
        models = response.json().get("models", [])
        return [
            {
                "id": f"ollama/{m['name']}",
                "name": m["name"],
                "size_gb": round(m.get("size", 0) / 1e9, 1),
                "modified_at": m.get("modified_at", ""),
            }
            for m in models
        ]
    except Exception:
        return [{"id": settings.MODEL_NAME, "name": settings.MODEL_NAME.replace("ollama/", ""), "size_gb": 0, "modified_at": ""}]

@router.get("/usage")
def get_usage(user: dict = Depends(get_current_user)):
    """Get current team's monthly token usage vs limit"""
    team_id = user["team_id"]
    db = get_db()
    
    monthly_used = _get_team_monthly_usage(db, team_id)
    token_limit = _get_team_limit(db, team_id)
    
    # Check if there's a pending credit request
    pending = db.execute(
        "SELECT id FROM credit_requests WHERE team_id = ? AND status = 'pending'",
        (team_id,)
    ).fetchone()
    
    db.close()
    
    return {
        "monthly_used": monthly_used,
        "token_limit": token_limit,
        "percentage": round((monthly_used / token_limit * 100), 1) if token_limit > 0 else 0,
        "exhausted": monthly_used >= token_limit,
        "has_pending_request": pending is not None,
    }

@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user: dict = Depends(get_current_user)):
    team_id = user["team_id"]
    user_id = user["id"]
    model = req.model or settings.MODEL_NAME

    # 0. Check usage limit
    db = get_db()
    monthly_used = _get_team_monthly_usage(db, team_id)
    token_limit = _get_team_limit(db, team_id)
    db.close()
    
    if monthly_used >= token_limit:
        raise HTTPException(
            status_code=429,
            detail="Your team has exhausted its monthly token budget. Request more credits from your admin."
        )

    # 1. Retrieve relevant chunks (only if using documents)
    hits = []
    context = ""
    if req.use_documents:
        hits = retrieve(req.question, team_id)
        context = "\n\n".join([h["text"] for h in hits])

    # 2. Get chat history
    history = get_history(user_id, limit=6)
    history_str = ""
    if history:
        history_str = "\nRecent conversation:\n"
        history_str += "\n".join(f"{h['role'].upper()}: {h['content']}" for h in history)

    # 3. Build prompt based on mode
    if req.use_documents and context:
        prompt = (
            f"You are an AI assistant for the {user.get('name', 'user')}'s team. "
            f"Answer ONLY from the provided context. "
            f"If the context does not contain the answer, say 'I don't have enough information in the documents to answer that.' "
            f"Cite which document the information comes from."
            f"{history_str}"
            f"\n\nContext:\n{context}"
            f"\n\nQuestion: {req.question}\n\nAnswer:"
        )
    elif req.use_documents and not context:
        prompt = (
            f"You are an AI assistant for the {user.get('name', 'user')}'s team. "
            f"The user asked a question but no relevant documents were found in the team's knowledge base. "
            f"Let them know no relevant documents were found and suggest uploading relevant documents."
            f"{history_str}"
            f"\n\nQuestion: {req.question}\n\nAnswer:"
        )
    else:
        # General knowledge mode
        prompt = (
            f"You are a helpful, knowledgeable AI assistant for the {user.get('name', 'user')}'s team at a company. "
            f"Answer the question to the best of your knowledge. Be concise, accurate, and professional."
            f"{history_str}"
            f"\n\nQuestion: {req.question}\n\nAnswer:"
        )

    # 4. Call LLM via litellm (or direct for Custom A2A Agents)
    selected_model = model

    # --- Custom A2A Agent Bypass ---
    if selected_model.startswith("custom_a2a/"):
        agent_id = int(selected_model.split("/")[1])
        db = get_db()
        agent = db.execute("SELECT * FROM registered_agents WHERE id = ?", (agent_id,)).fetchone()
        db.close()
        
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
            
        from backend.a2a.routes import _build_a2a_request, _parse_a2a_response
        import httpx
        
        a2a_payload = _build_a2a_request(prompt)
        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(agent["agent_url"], json=a2a_payload, headers={"Content-Type": "application/json"})
                response.raise_for_status()
                result_text = _parse_a2a_response(response.json())
                
            return {"answer": result_text, "sources": [], "model_used": agent["agent_name"]}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Custom agent error: {str(e)}")
    # --- End Custom A2A Agent Bypass ---

    # Load credentials if using a cloud model (not Ollama)
    if not selected_model.startswith("ollama/") and not selected_model.startswith("custom_a2a/"):
        from backend.models.routes import load_team_credentials
        # Look up provider from database instead of parsing the model string
        db = get_db()
        row = db.execute(
            "SELECT provider FROM configured_models WHERE litellm_model_string = ? AND team_id = ? AND is_active = 1",
            (selected_model, team_id)
        ).fetchone()
        db.close()
        if row:
            provider = row["provider"]
        else:
            # Fallback to parsing prefix
            provider = selected_model.split("/")[0]
        load_team_credentials(provider, team_id)

    # Build litellm call
    messages = [{"role": "user", "content": prompt}]
    completion_kwargs = {
        "model": selected_model,
        "messages": messages,
    }
    if selected_model.startswith("ollama/"):
        completion_kwargs["api_base"] = settings.OLLAMA_URL
    elif selected_model.startswith("a2a/"):
        completion_kwargs["api_base"] = os.environ.get("PYDANTIC_AI_API_BASE") or os.environ.get("A2A_API_BASE")
    elif selected_model.startswith("langgraph/"):
        completion_kwargs["api_base"] = os.environ.get("LANGGRAPH_API_BASE")

    db = get_db()
    mcp_tools, tool_routing_map = get_all_mcp_tools(db)
    
    if mcp_tools:
        completion_kwargs["tools"] = mcp_tools
        completion_kwargs["tool_choice"] = "auto"
        # Disable thinking/reasoning for Gemini models when tools are present
        # to avoid thought_signature issues in multi-turn tool calling
        if selected_model.startswith("gemini/"):
            completion_kwargs["reasoning_effort"] = "none"

    def _call_llm_with_retry(kwargs, max_retries=3):
        """Call litellm.completion with automatic retry on rate limit."""
        for attempt in range(max_retries):
            try:
                return litellm.completion(**kwargs)
            except litellm.exceptions.RateLimitError:
                if attempt < max_retries - 1:
                    time.sleep(5)  # Wait 5s before retrying
                else:
                    raise

    try:
        response = _call_llm_with_retry(completion_kwargs)
        
        tokens = response.usage.total_tokens if response.usage else 0

        # Implement Tool Calling Loop (max 5 iterations to prevent infinite loops)
        for _ in range(5):
            msg = response.choices[0].message
            
            # If no tool calls, break out and return the final answer
            if not hasattr(msg, 'tool_calls') or not msg.tool_calls:
                break
                
            # Append the assistant's full message object (not model_dump()!)
            # This preserves provider_specific_fields.thought_signature which
            # Gemini 2.5+ models require in multi-turn tool calling
            messages.append(msg)
            
            # Execute each tool call
            for tool_call in msg.tool_calls:
                tool_name = tool_call.function.name
                try:
                    arguments = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}
                    
                server_id = tool_routing_map.get(tool_name)
                
                if server_id:
                    result_text = execute_mcp_tool(db, server_id, tool_name, arguments)
                else:
                    result_text = f"Error: Tool '{tool_name}' not found in active MCP servers."
                    
                # Append the tool result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": result_text
                })
                
            # Call litellm again with the tool results
            completion_kwargs["messages"] = messages
            response = _call_llm_with_retry(completion_kwargs)
            if response.usage:
                tokens += response.usage.total_tokens
                
        answer = response.choices[0].message.content or "The assistant returned no text."
        
    except litellm.exceptions.RateLimitError as e:
        answer = f"⚠️ Rate limit exceeded for {model}. The free tier has very low limits. Please wait 30 seconds and try again."
        tokens = 0
    except Exception as e:
        # If tool calling caused the failure, retry WITHOUT tools as a fallback.
        # This handles: Groq tool_use_failed, models that don't support function calling,
        # malformed tool call responses, thought_signature issues, etc.
        error_str = str(e).lower()
        tool_failure_keywords = ["tool", "function", "failed_generation", "thought_signature", "tool_use_failed"]
        is_tool_failure = mcp_tools and any(kw in error_str for kw in tool_failure_keywords)
        
        if is_tool_failure:
            print(f"[AI Cowork] Tool calling failed for {selected_model}, retrying without tools: {e}")
            try:
                # Build a clean request without tools
                fallback_kwargs = {
                    "model": selected_model,
                    "messages": [{"role": "user", "content": prompt}],
                }
                if selected_model.startswith("ollama/"):
                    fallback_kwargs["api_base"] = settings.OLLAMA_URL
                    
                response = _call_llm_with_retry(fallback_kwargs)
                tokens = response.usage.total_tokens if response.usage else 0
                answer = response.choices[0].message.content or "The assistant returned no text."
            except litellm.exceptions.RateLimitError:
                answer = f"⚠️ Rate limit exceeded for {model}. The free tier has very low limits. Please wait 30 seconds and try again."
                tokens = 0
            except Exception as fallback_err:
                answer = f"Error communicating with the model: {str(fallback_err)}"
                tokens = 0
        else:
            answer = f"Error communicating with the model: {str(e)}"
            tokens = 0
        
    finally:
        db.close()

    # 5. Save to history and log usage
    sources = [{"filename": h["filename"], "relevance": h["relevance"]} for h in hits]
    save_turn(user_id, team_id, req.question, answer, sources, tokens, model)

    return AskResponse(answer=answer, sources=sources, model_used=model)
