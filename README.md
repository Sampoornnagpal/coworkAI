# AI Cowork - Enterprise AI Workspace Platform

A web platform where teams upload documents and chat with an AI that answers only from their team's knowledge base. Everything runs locally.

## Tech Stack
- **Backend**: FastAPI + SQLite + ChromaDB
- **Frontend**: React 18 + Vite + Tailwind CSS
- **LLM**: Ollama (llama3.1) via LiteLLM SDK
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)

## Prerequisites
- Python 3.13+
- Node.js 18+
- Ollama running at http://localhost:11434 with `llama3.1` model pulled

## Setup

### Backend
```bash
pip install -r requirements.txt
python seed.py
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Default Users
| Email | Password | Role | Team |
|---|---|---|---|
| admin@cowork.ai | admin123 | admin | Engineering |
| dev@cowork.ai | test123 | member | Engineering |
| hr@cowork.ai | test123 | member | HR |
| sales@cowork.ai | test123 | member | Sales |

## Architecture
- Each team has its own ChromaDB collection (`team_{id}`)
- Documents are chunked, embedded, and stored per-team
- Chat uses RAG: retrieve relevant chunks → build prompt → call Ollama
- Usage is tracked per-user and per-team in SQLite
