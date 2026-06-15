from fastapi import APIRouter
from catalog import get_models_catalog, get_operations_catalog
from typing import List
from schemas import CatalogModel, EndpointSpec

router = APIRouter(prefix="/catalog", tags=["catalog"])

@router.get("/models", response_model=List[CatalogModel])
def list_models(provider: str = None, mode: str = None, q: str = None):
    return get_models_catalog(provider_filter=provider, mode_filter=mode, query=q)

@router.get("/operations", response_model=List[EndpointSpec])
def list_operations():
    return get_operations_catalog()
