import traceback
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.database import get_db
from backend.auth.encryption import encrypt_secret, decrypt_secret
from backend.models.providers import SUPPORTED_PROVIDERS
import httpx
import json
import uuid
import os

router = APIRouter()

# A2A provider keys that route through LiteLLM (not direct JSON-RPC)
LITELLM_A2A_PROVIDERS = {"langgraph", "pydantic_ai", "bedrock_agent", "vertex_ai_agent", "azure_ai_agent"}


# --- Request Models ---

class RegisterAgent(BaseModel):
    agent_name: str
    agent_url: str = ""
    agent_description: str = ""
    agent_provider: str = "custom"
    credentials: dict = {}  # For LiteLLM providers: {"LANGGRAPH_API_BASE": "http://...", ...}


class InvokeAgent(BaseModel):
    message: str


# --- Helper: get provider credential spec ---

def _get_provider_credential_spec(provider_key: str) -> list:
    """Return the required_credentials list from SUPPORTED_PROVIDERS for a given A2A provider."""
    if provider_key in SUPPORTED_PROVIDERS:
        return SUPPORTED_PROVIDERS[provider_key].get("required_credentials", [])
    return []


def _get_provider_default_model_string(provider_key: str, agent_name: str, credentials: dict = None) -> str:
    """Build the litellm model string for an A2A agent, using unique identifiers if available."""
    creds = credentials or {}
    
    if provider_key == "azure_ai_agent":
        agent_id = creds.get("AZURE_AGENT_ID")
        if agent_id:
            return f"azure_ai/agents/{agent_id.strip()}"
        return f"azure_ai/agents/{agent_name.lower().replace(' ', '-')}"
        
    elif provider_key == "bedrock_agent":
        arn = creds.get("BEDROCK_AGENT_ARN")
        if arn:
            return f"bedrock/agentcore/{arn.strip()}"
        return f"bedrock/agentcore/{agent_name.lower().replace(' ', '-')}"
        
    elif provider_key == "vertex_ai_agent":
        res_id = creds.get("VERTEX_REASONING_ENGINE_ID")
        if res_id:
            val = res_id.strip()
            return f"vertex_ai/agent_engine/{val}"
        return f"vertex_ai/agent_engine/{agent_name.lower().replace(' ', '-')}"
        
    elif provider_key == "langgraph":
        return f"langgraph/{agent_name.lower().replace(' ', '-')}"
        
    elif provider_key == "pydantic_ai":
        safe_name = agent_name.lower().replace(" ", "-").replace("_", "-")
        return f"a2a/{safe_name}"
        
    provider_info = SUPPORTED_PROVIDERS.get(provider_key, {})
    defaults = provider_info.get("default_models", [])
    if defaults:
        prefix = defaults[0]["model_string"].split("/")[0]
        safe_name = agent_name.lower().replace(" ", "-").replace("_", "-")
        return f"{prefix}/{safe_name}"
    return f"{provider_key}/{agent_name.lower().replace(' ', '-')}"


def _load_agent_credentials_to_env(provider_key: str, team_id: int):
    """Load the A2A agent's credentials from DB into os.environ so litellm can use them.
    
    For Azure AI Agents, remaps AZURE_AI_* keys to the env vars LiteLLM expects:
      AZURE_AI_TENANT_ID  -> AZURE_TENANT_ID
      AZURE_AI_CLIENT_ID  -> AZURE_CLIENT_ID
      AZURE_AI_CLIENT_SECRET -> AZURE_CLIENT_SECRET
      AZURE_AI_API_BASE   -> AZURE_API_BASE
    """
    # Mapping from our DB keys to LiteLLM's expected env var names
    AZURE_AI_KEY_REMAP = {
        "AZURE_AI_TENANT_ID": "AZURE_TENANT_ID",
        "AZURE_AI_CLIENT_ID": "AZURE_CLIENT_ID",
        "AZURE_AI_CLIENT_SECRET": "AZURE_CLIENT_SECRET",
        "AZURE_AI_API_BASE": "AZURE_API_BASE",
    }
    db = get_db()
    creds = db.execute(
        "SELECT credential_key, credential_value FROM provider_credentials WHERE provider = ? AND team_id = ?",
        (provider_key, team_id)
    ).fetchall()
    db.close()
    for c in creds:
        key = c["credential_key"]
        value = decrypt_secret(c["credential_value"])
        # Remap Azure AI Agent keys to what LiteLLM expects
        if provider_key == "azure_ai_agent" and key in AZURE_AI_KEY_REMAP:
            os.environ[AZURE_AI_KEY_REMAP[key]] = value
        else:
            os.environ[key] = value


# --- Endpoints ---

@router.get("/provider-specs")
def get_a2a_provider_specs(user: dict = Depends(get_current_user)):
    """Return the credential specs for all LiteLLM A2A providers so the frontend can render dynamic forms."""
    specs = {}
    for key in LITELLM_A2A_PROVIDERS:
        if key in SUPPORTED_PROVIDERS:
            provider = SUPPORTED_PROVIDERS[key]
            specs[key] = {
                "name": provider["name"],
                "required_credentials": provider["required_credentials"],
            }
    return {"specs": specs}


@router.post("/agents")
def register_agent(req: RegisterAgent, user: dict = Depends(get_current_user)):
    """Register a new external AI agent (admin only)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    is_litellm = req.agent_provider in LITELLM_A2A_PROVIDERS
    team_id = user["team_id"]
    db = get_db()

    # --- Validate ---
    if not is_litellm and not req.agent_url:
        db.close()
        raise HTTPException(status_code=400, detail="Agent URL is required for custom agents")

    if is_litellm:
        # Validate that all required credentials are provided
        cred_spec = _get_provider_credential_spec(req.agent_provider)
        for spec in cred_spec:
            key = spec["key"]
            label = spec["label"]
            # Allow optional fields (those with "Optional" in the label)
            if "optional" in label.lower():
                continue
            if key not in req.credentials or not req.credentials[key].strip():
                db.close()
                raise HTTPException(status_code=400, detail=f"Missing required credential: {label}")

    try:
        # 1. Insert into registered_agents table
        agent_url_to_save = req.agent_url if not is_litellm else f"litellm://{req.agent_provider}"
        db.execute(
            """INSERT INTO registered_agents (agent_name, agent_url, agent_description, agent_provider, added_by)
               VALUES (?, ?, ?, ?, ?)""",
            (req.agent_name, agent_url_to_save, req.agent_description, req.agent_provider, user["id"])
        )
        db.commit()
    except Exception as e:
        db.close()
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail=f"Agent '{req.agent_name}' already exists")
        raise HTTPException(status_code=500, detail=str(e))

    if is_litellm:
        # 2. Save credentials into provider_credentials (encrypted, scoped to team)
        for key, value in req.credentials.items():
            if not value or not value.strip():
                continue
            encrypted_val = encrypt_secret(value.strip())
            db.execute(
                """INSERT INTO provider_credentials (provider, credential_key, credential_value, team_id, added_by)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(provider, credential_key, team_id) DO UPDATE SET credential_value = excluded.credential_value""",
                (req.agent_provider, key, encrypted_val, team_id, user["id"])
            )

        # 3. Activate the agent as a model in configured_models so it appears in Chat
        model_string = _get_provider_default_model_string(req.agent_provider, req.agent_name, req.credentials)
        display_name = req.agent_name

        existing = db.execute(
            "SELECT id FROM configured_models WHERE litellm_model_string = ? AND team_id = ?",
            (model_string, team_id)
        ).fetchone()

        if existing:
            db.execute("UPDATE configured_models SET is_active = 1 WHERE id = ?", (existing["id"],))
        else:
            db.execute(
                """INSERT INTO configured_models (provider, model_name, display_name, litellm_model_string, added_by, team_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (req.agent_provider, display_name, display_name, model_string, user["id"], team_id)
            )

        db.commit()

    db.close()
    return {"status": "ok", "message": f"Agent '{req.agent_name}' registered"}


@router.get("/agents")
def list_agents(user: dict = Depends(get_current_user)):
    """List all registered agents with credential status for LiteLLM agents."""
    db = get_db()
    agents = db.execute(
        "SELECT id, agent_name, agent_url, agent_description, agent_provider, is_active, created_at FROM registered_agents"
    ).fetchall()

    team_id = user["team_id"]
    result = []
    for a in agents:
        agent_dict = dict(a)
        agent_dict["is_litellm"] = a["agent_provider"] in LITELLM_A2A_PROVIDERS

        # For LiteLLM agents, check credential status
        if agent_dict["is_litellm"]:
            cred_spec = _get_provider_credential_spec(a["agent_provider"])
            saved_creds = db.execute(
                "SELECT credential_key, credential_value FROM provider_credentials WHERE provider = ? AND team_id = ?",
                (a["agent_provider"], team_id)
            ).fetchall()
            saved_keys = {row["credential_key"] for row in saved_creds}
            agent_dict["credentials_configured"] = all(c["key"] in saved_keys for c in cred_spec)
            
            # Load and decrypt saved credentials to build the correct model string
            creds_dict = {}
            for row in saved_creds:
                try:
                    creds_dict[row["credential_key"]] = decrypt_secret(row["credential_value"])
                except Exception:
                    pass
            agent_dict["model_string"] = _get_provider_default_model_string(a["agent_provider"], a["agent_name"], creds_dict)
        else:
            agent_dict["credentials_configured"] = True  # Custom agents don't need credentials
            agent_dict["model_string"] = f"custom_a2a/{a['id']}"

        result.append(agent_dict)

    db.close()
    return {"agents": result}


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, user: dict = Depends(get_current_user)):
    """Delete a registered agent (admin only). Also cleans up configured_models for LiteLLM agents."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()

    agent = db.execute("SELECT * FROM registered_agents WHERE id = ?", (agent_id,)).fetchone()
    if not agent:
        db.close()
        raise HTTPException(status_code=404, detail="Agent not found")

    # If it's a LiteLLM agent, also deactivate its model from configured_models
    if agent["agent_provider"] in LITELLM_A2A_PROVIDERS:
        # Load and decrypt credentials to build the exact model string for deletion
        saved_creds = db.execute(
            "SELECT credential_key, credential_value FROM provider_credentials WHERE provider = ? AND team_id = ?",
            (agent["agent_provider"], user["team_id"])
        ).fetchall()
        creds_dict = {}
        for row in saved_creds:
            try:
                creds_dict[row["credential_key"]] = decrypt_secret(row["credential_value"])
            except Exception:
                pass
        model_string = _get_provider_default_model_string(agent["agent_provider"], agent["agent_name"], creds_dict)
        db.execute(
            "DELETE FROM configured_models WHERE litellm_model_string = ? AND team_id = ?",
            (model_string, user["team_id"])
        )

    db.execute("DELETE FROM registered_agents WHERE id = ?", (agent_id,))
    db.commit()
    db.close()
    return {"status": "ok"}


def _build_a2a_request(message: str) -> dict:
    """Build an A2A protocol JSON-RPC request."""
    return {
        "jsonrpc": "2.0",
        "method": "tasks/send",
        "id": str(uuid.uuid4()),
        "params": {
            "id": str(uuid.uuid4()),
            "message": {
                "role": "user",
                "parts": [
                    {"kind": "text", "text": message}
                ]
            }
        }
    }


def _parse_a2a_response(data: dict) -> str:
    """Parse an A2A protocol JSON-RPC response to extract text."""
    try:
        # Standard A2A response
        if "result" in data:
            result = data["result"]
            # Check for artifacts (completed task response)
            if "artifacts" in result:
                texts = []
                for artifact in result["artifacts"]:
                    for part in artifact.get("parts", []):
                        if part.get("kind") == "text":
                            texts.append(part["text"])
                if texts:
                    return "\n".join(texts)
            # Check for status message
            if "status" in result:
                status = result["status"]
                msg = status.get("message", {})
                parts = msg.get("parts", [])
                texts = [p["text"] for p in parts if p.get("kind") == "text"]
                if texts:
                    return "\n".join(texts)
            return json.dumps(result, indent=2)
        if "error" in data:
            return f"Agent error: {data['error'].get('message', 'Unknown error')}"
        return json.dumps(data, indent=2)
    except Exception:
        return json.dumps(data, indent=2)


@router.post("/agents/{agent_id}/invoke")
def invoke_agent(agent_id: int, req: InvokeAgent, user: dict = Depends(get_current_user)):
    """Invoke a registered agent with a message.
    
    For custom agents: uses direct JSON-RPC HTTP POST.
    For LiteLLM agents: uses litellm.completion() with native A2A routing.
    """
    db = get_db()
    agent = db.execute("SELECT * FROM registered_agents WHERE id = ?", (agent_id,)).fetchone()
    if not agent:
        db.close()
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_name = agent["agent_name"]
    agent_provider = agent["agent_provider"]

    if agent_provider in LITELLM_A2A_PROVIDERS:
        # --- LiteLLM A2A Route ---
        db.close()
        team_id = user["team_id"]
        _load_agent_credentials_to_env(agent_provider, team_id)
        model_string = _get_provider_default_model_string(agent_provider, agent_name)

        import litellm
        import os
        try:
            completion_kwargs = {
                "model": model_string,
                "messages": [{"role": "user", "content": req.message}]
            }
            if model_string.startswith("a2a/"):
                completion_kwargs["api_base"] = os.environ.get("PYDANTIC_AI_API_BASE") or os.environ.get("A2A_API_BASE")
            elif model_string.startswith("langgraph/"):
                completion_kwargs["api_base"] = os.environ.get("LANGGRAPH_API_BASE")
                
            response = litellm.completion(**completion_kwargs)
            result_text = response.choices[0].message.content
            tokens = response.usage.total_tokens if response.usage else 0
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LiteLLM agent error: {str(e)}")

        # Log usage
        db2 = get_db()
        try:
            db2.execute(
                "INSERT INTO usage_logs (user_id, team_id, model_name, tokens_used) VALUES (?, ?, ?, ?)",
                (user["id"], user["team_id"], f"agent:{agent_name}", tokens)
            )
            db2.commit()
        except Exception:
            pass
        db2.close()

        return {"agent": agent_name, "response": result_text}
    else:
        # --- Custom Direct JSON-RPC Route ---
        agent_url = agent["agent_url"]
        a2a_payload = _build_a2a_request(req.message)

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    agent_url,
                    json=a2a_payload,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                response_data = response.json()
        except httpx.ConnectError:
            db.close()
            raise HTTPException(status_code=502, detail=f"Cannot connect to agent at {agent_url}")
        except httpx.HTTPStatusError as e:
            db.close()
            raise HTTPException(status_code=502, detail=f"Agent returned HTTP {e.response.status_code}")
        except Exception as e:
            db.close()
            raise HTTPException(status_code=500, detail=f"Error invoking agent: {str(e)}")

        result_text = _parse_a2a_response(response_data)

        # Log usage
        try:
            db.execute(
                "INSERT INTO usage_logs (user_id, team_id, model_name, tokens_used) VALUES (?, ?, ?, ?)",
                (user["id"], user["team_id"], f"agent:{agent_name}", 0)
            )
            db.commit()
        except Exception:
            pass
        db.close()

        return {"agent": agent_name, "response": result_text}


@router.post("/agents/{agent_id}/test")
def test_agent(agent_id: int, user: dict = Depends(get_current_user)):
    """Send a test message to verify agent connectivity.
    
    For custom agents: uses direct JSON-RPC HTTP POST.
    For LiteLLM agents: uses litellm.completion() to verify credentials + connectivity.
    """
    db = get_db()
    agent = db.execute("SELECT * FROM registered_agents WHERE id = ?", (agent_id,)).fetchone()
    if not agent:
        db.close()
        raise HTTPException(status_code=404, detail="Agent not found")

    agent_name = agent["agent_name"]
    agent_provider = agent["agent_provider"]

    if agent_provider in LITELLM_A2A_PROVIDERS:
        # --- LiteLLM A2A Test ---
        db.close()
        team_id = user["team_id"]
        _load_agent_credentials_to_env(agent_provider, team_id)
        model_string = _get_provider_default_model_string(agent_provider, agent_name)

        import litellm
        import os
        try:
            completion_kwargs = {
                "model": model_string,
                "messages": [{"role": "user", "content": "Hello, what can you do?"}]
            }
            if model_string.startswith("a2a/"):
                completion_kwargs["api_base"] = os.environ.get("PYDANTIC_AI_API_BASE") or os.environ.get("A2A_API_BASE")
            elif model_string.startswith("langgraph/"):
                completion_kwargs["api_base"] = os.environ.get("LANGGRAPH_API_BASE")
                
            response = litellm.completion(**completion_kwargs)
            result_text = response.choices[0].message.content
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LiteLLM test failed: {str(e)}")

        return {"status": "ok", "response": result_text}
    else:
        # --- Custom Direct JSON-RPC Test ---
        agent_url = agent["agent_url"]
        db.close()
        a2a_payload = _build_a2a_request("Hello, what can you do?")

        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(
                    agent_url,
                    json=a2a_payload,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                response_data = response.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail=f"Cannot connect to agent at {agent_url}")
        except httpx.HTTPStatusError as e:
            import traceback
            err= traceback.format_exc()
            print(f"{err=}")
            raise HTTPException(status_code=502, detail=f"Agent returned HTTP {e.response.status_code}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")

        result_text = _parse_a2a_response(response_data)
        return {"status": "ok", "response": result_text}
