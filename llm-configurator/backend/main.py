from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from db import init_db
from router_manager import load_all_configs_on_startup

from routes.config_routes import router as config_router
from routes.llm_routes import router as llm_router
from routes.catalog_routes import router as catalog_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_all_configs_on_startup()
    yield

app = FastAPI(title="LLM Configurator", lifespan=lifespan)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(llm_router)
app.include_router(catalog_router)
