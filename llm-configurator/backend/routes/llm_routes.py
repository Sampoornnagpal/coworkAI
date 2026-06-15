import time
import re
from fastapi import APIRouter, HTTPException, Request, Header, status
from fastapi.responses import JSONResponse
from typing import Optional, Any
import os

from router_manager import get_router, _configs, get_operations, has_vision, get_capabilities, get_custom_op_description
from schemas import RESERVED_SEGMENTS
from rate_limiter import rate_limiter
from db import log_usage
from config_store import _get_file_path

router = APIRouter(prefix="/llm", tags=["llm_endpoints"])

# Basic PII regexes
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_REGEX = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")

def apply_pii_masking(text: str) -> str:
    if not isinstance(text, str):
        return text
    text = EMAIL_REGEX.sub("[EMAIL REDACTED]", text)
    text = PHONE_REGEX.sub("[PHONE REDACTED]", text)
    return text

async def pre_flight_check(full_name: str, operation: str, body: dict):
    config = _configs.get(full_name)
    if not config or config.status != "active":
        raise HTTPException(status_code=404, detail="config not found")

    ops = get_operations(full_name)
    if operation == "vision":
        if not has_vision(full_name):
            raise HTTPException(status_code=400, detail="this config has no vision-capable model")
    else:
        if operation not in ops:
            raise HTTPException(status_code=400, detail=f"this config has no {operation}-capable model")
            
    rpm = config.restrictions.rpm
    is_allowed = await rate_limiter.check_rate_limit(full_name, rpm)
    if not is_allowed:
        # Note: Frontend must read detail.error_type since FastAPI wraps this in {"detail": ...}
        raise HTTPException(
            status_code=429, 
            detail={"error_type": "rate_limit", "message": f"Rate limit exceeded. Max {rpm} RPM."}
        )
        
    tpr = config.restrictions.tpr
    if operation in ("chat", "completion", "vision"):
        max_tokens = body.get("max_tokens")
        if max_tokens is None:
            body["max_tokens"] = tpr
        elif max_tokens > tpr:
            raise HTTPException(status_code=400, detail=f"max_tokens {max_tokens} exceeds config cap of {tpr}")
            
    # Apply PII Guardrail
    if operation in ("chat", "completion", "vision") and config.guardrails.pii_masking:
        if operation in ("chat", "vision"):
            messages = body.get("messages", [])
            for msg in messages:
                if msg.get("role") == "user":
                    content = msg.get("content")
                    if isinstance(content, str):
                        msg["content"] = apply_pii_masking(content)
                    elif isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                part["text"] = apply_pii_masking(part.get("text", ""))
        elif operation == "completion":
            prompt = body.get("prompt")
            if isinstance(prompt, str):
                body["prompt"] = apply_pii_masking(prompt)
                
    return config

def extract_model_used(response: Any) -> Optional[str]:
    try:
        model = getattr(response, "model", None)
        if model:
            return model
            
        hidden = getattr(response, "_hidden_params", {})
        if hidden and "model_id" in hidden:
            return hidden["model_id"]
    except Exception:
        pass
    return None

def extract_usage(response: Any) -> tuple[int, int, int]:
    try:
        usage = getattr(response, "usage", None)
        if usage:
            return (
                getattr(usage, "prompt_tokens", 0) or 0,
                getattr(usage, "completion_tokens", 0) or 0,
                getattr(usage, "total_tokens", 0) or 0
            )
    except Exception:
        pass
    return 0, 0, 0

async def execute_router_call(
    full_name: str, 
    endpoint_name: str, 
    agent_id: str, 
    operation_coro
) -> JSONResponse:
    start_time = time.time()
    try:
        response = await operation_coro
        latency_ms = (time.time() - start_time) * 1000
        
        model_used = extract_model_used(response)
        p_tok, c_tok, t_tok = extract_usage(response)
        
        log_usage(
            config_full_name=full_name,
            agent_id=agent_id,
            endpoint=endpoint_name,
            model_used=model_used,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            total_tokens=t_tok,
            latency_ms=latency_ms,
            success=True,
            error=None
        )
        
        # Dump model response
        resp_dict = response.model_dump() if hasattr(response, "model_dump") else dict(response)
        resp_dict["model_used"] = model_used
        
        return JSONResponse(content=resp_dict)
        
    except Exception as e:
        latency_ms = (time.time() - start_time) * 1000
        error_msg = str(e)
        
        log_usage(
            config_full_name=full_name,
            agent_id=agent_id,
            endpoint=endpoint_name,
            model_used=None,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=latency_ms,
            success=False,
            error=error_msg
        )
        
        raise HTTPException(status_code=502, detail=error_msg)

@router.post("/{full_name}/chat")
async def chat_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "chat", body)
    
    internal_model_name = f"{full_name}::chat"
    router_instance = get_router(full_name)
    
    coro = router_instance.acompletion(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/chat", x_agent_id, coro)

@router.post("/{full_name}/vision")
async def vision_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "vision", body)
    
    internal_model_name = f"{full_name}::chat"  # Vision uses chat models
    router_instance = get_router(full_name)
    
    coro = router_instance.acompletion(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/vision", x_agent_id, coro)

@router.post("/{full_name}/completions")
async def completions_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "completion", body)
    
    internal_model_name = f"{full_name}::completion"
    router_instance = get_router(full_name)
    
    coro = router_instance.atext_completion(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/completions", x_agent_id, coro)

@router.post("/{full_name}/embeddings")
async def embeddings_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "embedding", body)
    
    internal_model_name = f"{full_name}::embedding"
    router_instance = get_router(full_name)
    
    coro = router_instance.aembedding(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/embeddings", x_agent_id, coro)

@router.post("/{full_name}/images/generations")
async def images_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "image_generation", body)
    
    internal_model_name = f"{full_name}::image_generation"
    router_instance = get_router(full_name)
    
    coro = router_instance.aimage_generation(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/images/generations", x_agent_id, coro)

@router.post("/{full_name}/audio/transcriptions")
async def audio_transcriptions_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    form = await request.form()
    kwargs = dict(form)
    
    if "file" in kwargs:
        file_obj = kwargs["file"]
        kwargs["file"] = await file_obj.read()
        
    await pre_flight_check(full_name, "audio_transcription", kwargs)
    
    internal_model_name = f"{full_name}::audio_transcription"
    router_instance = get_router(full_name)
    
    coro = router_instance.atranscription(model=internal_model_name, **kwargs)
    return await execute_router_call(full_name, "/audio/transcriptions", x_agent_id, coro)

@router.post("/{full_name}/audio/speech")
async def audio_speech_endpoint(full_name: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    body = await request.json()
    await pre_flight_check(full_name, "audio_speech", body)
    
    internal_model_name = f"{full_name}::audio_speech"
    router_instance = get_router(full_name)
    
    coro = router_instance.aspeech(model=internal_model_name, **body)
    return await execute_router_call(full_name, "/audio/speech", x_agent_id, coro)

@router.get("/{full_name}/usage")
async def usage_endpoint(full_name: str):
    # 404 only for unknown configs (disabled configs still show usage)
    config = _configs.get(full_name)
    if not config and not os.path.exists(_get_file_path(full_name)):
        raise HTTPException(status_code=404, detail="config not found")
        
    from db import get_usage_stats
    usage_stats = get_usage_stats(full_name)
    rate_window = await rate_limiter.get_usage(full_name)
    
    usage_stats["rate_window"] = rate_window
    return usage_stats

@router.get("/{full_name}/capabilities")
async def capabilities_endpoint(full_name: str):
    try:
        caps = get_capabilities(full_name)
        return caps.model_dump()
    except ValueError:
        raise HTTPException(status_code=404, detail="config not found")

@router.post("/{full_name}/{custom_op}")
async def custom_operation_endpoint(full_name: str, custom_op: str, request: Request, x_agent_id: Optional[str] = Header(None)):
    if custom_op in RESERVED_SEGMENTS:
        # Fall through to default 404 if someone tries to POST to a non-existent built-in
        raise HTTPException(status_code=404, detail="Not Found")
        
    description = get_custom_op_description(full_name, custom_op)
    if not description:
        raise HTTPException(status_code=404, detail=f"Custom operation '{custom_op}' not found in config '{full_name}'")

    body = await request.json()
    
    # 1. Run pre_flight_check as 'chat'. This enforces RPM/TPR and masks PII in user messages
    await pre_flight_check(full_name, "chat", body)
    
    # 2. Inject the system prompt BEFORE sending to the router
    messages = body.get("messages", [])
    body["messages"] = [{"role": "system", "content": description}] + messages
    
    internal_model_name = f"{full_name}::custom::{custom_op}"
    router_instance = get_router(full_name)
    
    # 3. Execute via standard execute_router_call for logging and metrics
    coro = router_instance.acompletion(model=internal_model_name, **body)
    return await execute_router_call(full_name, f"/{custom_op}", x_agent_id, coro)
