from fastapi import APIRouter, HTTPException
from catalog import get_models_catalog, get_operations_catalog
from typing import List, Dict, Any
from schemas import CatalogModel, EndpointSpec, GlobalModelCreate
import db

router = APIRouter(prefix="/catalog", tags=["catalog"])

@router.get("/models", response_model=List[CatalogModel])
def list_models(provider: str = None, mode: str = None, q: str = None):
    return get_models_catalog(provider_filter=provider, mode_filter=mode, query=q)

@router.get("/operations", response_model=List[EndpointSpec])
def list_operations():
    return get_operations_catalog()

@router.get("/global_models", response_model=List[Dict[str, Any]])
def list_global_models():
    return db.get_global_models()

@router.post("/global_models")
def create_global_model(req: GlobalModelCreate):
    db.add_global_model(req.litellm_model, req.provider, req.api_key, req.api_base)
    return {"status": "success", "message": f"Saved {req.litellm_model}"}

@router.delete("/global_models/{litellm_model}")
def delete_global_model(litellm_model: str):
    db.delete_global_model(litellm_model)
    return {"status": "success"}
