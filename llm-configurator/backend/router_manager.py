import os
import glob
import json
import logging
from typing import Dict, Set

import litellm
from litellm import Router

from schemas import ConfigResponse, CapabilitiesResponse
from catalog import get_models_catalog, get_operations_catalog

logger = logging.getLogger(__name__)

# Registry: full_name -> litellm.Router
_registry: Dict[str, Router] = {}

# Registry: full_name -> dict of custom op descriptions
_custom_op_descriptions: Dict[str, Dict[str, str]] = {}

# Keep track of the original config specs for capabilities reporting
_configs: Dict[str, ConfigResponse] = {}

def build_router_for_config(config: ConfigResponse):
    """
    Builds a LiteLLM Router for the given config and stores it in the registry.
    This overwrites any existing router for the same full_name.
    """
    import db
    global_models_list = db.get_global_models()
    global_models = {gm["litellm_model"]: gm for gm in global_models_list}

    router_model_list = []
    
    for op, models in config.operations.items():
        if not models:
            continue
            
        # Group models into a logical "model" for this operation, e.g. "doc_summariser_config::chat"
        internal_model_name = f"{config.full_name}::{op}"
        
        for m in models:
            gm = global_models.get(m.litellm_model)
            api_key = gm.get("api_key") if gm else None
            api_base = gm.get("api_base") if gm else None

            # fallback to old behavior if not found in db
            if not api_key and m.api_key_env:
                api_key = os.environ.get(m.api_key_env)
            if not api_base and m.api_base:
                api_base = m.api_base
                
            litellm_params = {
                "model": m.litellm_model,
            }
            
            if api_key:
                litellm_params["api_key"] = api_key
            if api_base:
                litellm_params["api_base"] = api_base
                
            litellm_params["tpm"] = m.tpm if m.tpm is not None else config.restrictions.tpm
            litellm_params["rpm"] = m.rpm if m.rpm is not None else config.restrictions.rpm
            litellm_params["order"] = m.priority
                
            router_model_list.append({
                "model_name": internal_model_name,
                "litellm_params": litellm_params
            })
            
    # Process custom operations
    custom_ops = config.custom_operations or {}
    _custom_op_descriptions[config.full_name] = {}
    for op_name, custom_op in custom_ops.items():
        internal_model_name = f"{config.full_name}::custom::{op_name}"
        _custom_op_descriptions[config.full_name][op_name] = custom_op.description
        
        for m in custom_op.models:
            gm = global_models.get(m.litellm_model)
            api_key = gm.get("api_key") if gm else None
            api_base = gm.get("api_base") if gm else None

            if not api_key and m.api_key_env:
                api_key = os.environ.get(m.api_key_env)
            if not api_base and m.api_base:
                api_base = m.api_base
                
            litellm_params = {
                "model": m.litellm_model,
            }
            if api_key:
                litellm_params["api_key"] = api_key
            if api_base:
                litellm_params["api_base"] = api_base
                
            litellm_params["tpm"] = m.tpm if m.tpm is not None else config.restrictions.tpm
            litellm_params["rpm"] = m.rpm if m.rpm is not None else config.restrictions.rpm
            litellm_params["order"] = m.priority
                
            router_model_list.append({
                "model_name": internal_model_name,
                "litellm_params": litellm_params
            })
            
    router = Router(
        model_list=router_model_list,
        num_retries=2,
        timeout=120,
        routing_strategy="usage-based-routing-v2",
        enable_pre_call_checks=True
    )
    
    _registry[config.full_name] = router
    _configs[config.full_name] = config
    
    logger.info(f"Built and registered Router for {config.full_name} with {len(router_model_list)} deployments.")

def evict_router(full_name: str):
    """
    Removes a Router from the registry. The endpoint immediately 404s.
    """
    if full_name in _registry:
        del _registry[full_name]
    if full_name in _configs:
        del _configs[full_name]
    if full_name in _custom_op_descriptions:
        del _custom_op_descriptions[full_name]
    logger.info(f"Evicted Router for {full_name}")

def get_router(full_name: str) -> Router:
    return _registry.get(full_name)

def get_custom_op_description(full_name: str, op_name: str) -> str:
    return _custom_op_descriptions.get(full_name, {}).get(op_name)

def get_operations(full_name: str) -> Set[str]:
    """Returns the set of operations this config supports."""
    if full_name not in _configs:
        return set()
    return set(_configs[full_name].operations.keys())

def has_vision(full_name: str) -> bool:
    """Checks if any chat member has supports_vision per litellm.model_cost."""
    if full_name not in _configs:
        return False
        
    chat_models = _configs[full_name].operations.get("chat", [])
    for m in chat_models:
        cost_info = litellm.model_cost.get(m.litellm_model, {})
        if cost_info.get("supports_vision", False):
            return True
            
    return False

def get_capabilities(full_name: str) -> CapabilitiesResponse:
    if full_name not in _configs:
        raise ValueError(f"Config {full_name} not found in registry.")
        
    ops = get_operations(full_name)
    vision_supported = has_vision(full_name)
    
    endpoints = []
    for spec in get_operations_catalog():
        if spec.operation in ops or (spec.operation == "vision" and vision_supported):
            # Resolve path template
            resolved_path = spec.path.replace("{name}", full_name)
            endpoints.append(f"http://localhost:8001{resolved_path}")
            
    # Add custom operations endpoints
    custom_ops = _configs[full_name].custom_operations or {}
    for op_name in custom_ops.keys():
        endpoints.append(f"http://localhost:8001/llm/{full_name}/{op_name}")
            
    return CapabilitiesResponse(
        operations=list(ops),
        vision=vision_supported,
        endpoints=endpoints
    )

def load_all_configs_on_startup():
    from config_store import CONFIGS_DIR
    files = glob.glob(os.path.join(CONFIGS_DIR, "*.json"))
    loaded = 0
    for f in files:
        try:
            with open(f, "r", encoding="utf-8") as fd:
                data = json.load(fd)
                config_resp = ConfigResponse(**data)
                if config_resp.status == "active":
                    build_router_for_config(config_resp)
                    loaded += 1
        except Exception as e:
            logger.error(f"Failed to load config {f}: {e}")
            
    logger.info(f"Loaded {loaded} active configs on startup.")
