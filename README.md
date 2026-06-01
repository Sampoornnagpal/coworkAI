# AI Cowork — Setup Guide

An AI-powered team workspace with RAG, MCP tool integration, A2A agent orchestration, and multi-model LLM support.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | 3.11+ | Backend runtime |
| **Node.js** | 18+ | Frontend build |
| **Ollama** *(optional)* | Latest | Local LLM inference |
| **Docker** *(optional)* | Latest | Run ChromaDB containerised |

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/Sampoornnagpal/coworkAI.git
cd coworkAI
```

### 2. Backend Setup
```bash
# Create and activate virtual environment (recommended)
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the project root:
```env
JWT_SECRET=your-secret-key-here
DATABASE_PATH=./data/cowork.db
CHROMA_PATH=./data/chroma
OLLAMA_URL=http://localhost:11434
MODEL_NAME=ollama/llama3.1
EMBEDDING_MODEL=all-MiniLM-L6-v2
```
> **Note:** `ENCRYPTION_KEY` will be auto-generated on first run and appended to `.env`.

### 4. Seed the Database
```bash
python seed.py
```
This creates default teams and users:
- **Admin:** `admin@cowork.ai` / `admin123`
- **Members:** `dev@cowork.ai`, `hr@cowork.ai`, `sales@cowork.ai` / `test123`

### 5. Start the Backend
```bash
python -m uvicorn backend.main:app --port 8000
```

### 6. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The app will open at `http://localhost:5173`.

## Project Structure
```
ai-cowork/
├── backend/
│   ├── admin/         # Admin dashboard API
│   ├── auth/          # JWT authentication
│   ├── a2a/           # Agent-to-Agent (A2A) integration
│   ├── chat/          # Chat + Orchestrator engine
│   ├── credit/        # Token credit requests
│   ├── mcp_client/    # MCP tool server integration
│   ├── models/        # Multi-model management
│   ├── rag/           # Document upload & retrieval
│   ├── config.py      # App settings
│   ├── database.py    # SQLite schema + migrations
│   └── main.py        # FastAPI entrypoint
├── frontend/          # React + Vite + Tailwind
├── agents/            # Custom A2A agent scripts
│   ├── calculator_agent/
│   └── mock_langgraph/
├── requirements.txt   # Python dependencies
├── seed.py            # Database seeder
└── .env               # Environment config (create manually)
```

## Configuring LLM Providers

1. Log in as admin → go to **Models** page.
2. Add API keys for your preferred providers (OpenAI, Gemini, Anthropic, Groq, etc.).
3. Activate models — they will appear in the Chat dropdown.

## Running Custom Agents (Optional)

```bash
# Smart Calculator (Pydantic AI) — runs on port 5002
cd agents/calculator_agent
python -m venv venv
venv\Scripts\activate  # or source venv/bin/activate
pip install pydantic-ai uvicorn fastapi
python agent.py

# LangGraph Mock — runs on port 5003
cd agents/mock_langgraph
python agent.py
```

Then register them in the **Agents** page of the UI.
