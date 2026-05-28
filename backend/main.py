from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.database import create_tables
from backend.auth.routes import router as auth_router
from backend.rag.routes import router as rag_router
from backend.chat.routes import router as chat_router
from backend.admin.routes import router as admin_router
from backend.credit.routes import router as credit_router
from backend.models.routes import router as models_router
from backend.mcp_client.routes import router as mcp_router
from backend.a2a.routes import router as a2a_router

@asynccontextmanager
async def lifespan(app):
    create_tables()
    yield

app = FastAPI(title="AI Cowork", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(rag_router, prefix="/rag", tags=["rag"])
app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(credit_router, prefix="/credit", tags=["credit"])
app.include_router(models_router, prefix="/models", tags=["models"])
app.include_router(mcp_router, prefix="/mcp", tags=["mcp"])
app.include_router(a2a_router, prefix="/a2a", tags=["a2a"])

@app.get("/health")
def health():
    return {"status": "ok"}

