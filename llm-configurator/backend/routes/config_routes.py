from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any

from schemas import ConfigRequest, ConfigResponse, CapabilitiesResponse
from config_store import (
    create_config, 
    update_config, 
    get_config, 
    list_configs, 
    delete_config,
    ConfigAlreadyExistsError,
    ConfigNotFoundError
)
import router_manager

router = APIRouter(prefix="/configs", tags=["configs"])

@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_new_config(config_req: ConfigRequest):
    try:
        config_resp = create_config(config_req)
    except ConfigAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        
    # Build Router and insert into registry
    router_manager.build_router_for_config(config_resp)
    
    capabilities = router_manager.get_capabilities(config_resp.full_name)
    
    return {
        "config": config_resp.model_dump(),
        "capabilities": capabilities.model_dump()
    }

@router.get("", response_model=List[Dict[str, Any]])
async def list_all_configs():
    return list_configs()

@router.get("/{full_name}", response_model=ConfigResponse)
async def get_single_config(full_name: str):
    config = get_config(full_name)
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")
    return config

@router.put("/{full_name}", response_model=Dict[str, Any])
async def update_existing_config(full_name: str, config_req: ConfigRequest):
    try:
        config_resp = update_config(full_name, config_req)
    except ConfigNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        
    # Rebuild Router
    router_manager.build_router_for_config(config_resp)
    
    capabilities = router_manager.get_capabilities(config_resp.full_name)
    
    return {
        "config": config_resp.model_dump(),
        "capabilities": capabilities.model_dump()
    }

@router.delete("/{full_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_config(full_name: str):
    deleted = delete_config(full_name)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")
        
    # Evict from Router registry
    router_manager.evict_router(full_name)
    return None
