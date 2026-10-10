# AI Cowork

AI Cowork is a self-hosted team AI workspace. Teams chat with any LLM, ground answers in their own documents, call tools on MCP servers, delegate to external agents over A2A, and route all of it through a managed LLM gateway that has fallback chains, guardrails, rate limits and usage analytics.

Today it runs as **two independent FastAPI backends behind one React frontend**:

1. **Core platform** (port `8000`). The workspace itself: chat, document RAG, MCP tool calling, agent-to-agent (A2A) calls, JWT login, team budgets and the admin console.
2. **LLM Configurator** (port `8001`). An LLM gateway. You define a named config of models, fallback order, limits and guardrails, and it is live straight away as a REST endpoint with its own usage dashboard.

The two backends share nothing except the frontend. Each has its own entry point, dependency file and database, so either one can run without the other.

**Where it's going:** the next major piece is **Agent Studio**, a Langflow-style visual canvas. Users will drag and drop LLMs, tools, documents and agents onto it to build low-code/no-code agents, and then orchestrate several agents into multi-agent workflows. See [Roadmap: Agent Studio](#roadmap-agent-studio-visual-agent-builder).

---

## Contents

- [Quick links](#quick-links)
- [Features](#features)
- [System architecture](#system-architecture)
- [Project structure](#project-structure)
- [How a chat request is handled](#how-a-chat-request-is-handled)
- [How a Configurator request is handled](#how-a-configurator-request-is-handled)
- [API overview](#api-overview)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Roadmap: Agent Studio (visual agent builder)](#roadmap-agent-studio-visual-agent-builder)

---

## Quick links

| Document | What it covers | Link |
|---|---|---|
| Core platform documentation | Architecture, RAG, MCP tool loop, A2A agents, auth, DB schema | [`DOCUMENTATION_CORE.md`](DOCUMENTATION_CORE.md) |
| LLM Configurator documentation | Gateway architecture, fallback chains, guardrails, analytics | [`llm-configurator/DOCUMENTATION.md`](llm-configurator/DOCUMENTATION.md) |
| LLM Configurator PDF | The same documentation as a PDF | [`llm-configurator/DOCUMENTATION.pdf`](llm-configurator/DOCUMENTATION.pdf) |
| Core platform requirements | Python dependencies for port 8000 | [`requirements.txt`](requirements.txt) |
| Configurator requirements | Python dependencies for port 8001 | [`llm-configurator/backend/requirements.txt`](llm-configurator/backend/requirements.txt) |

---

## Features

### Core platform (`backend/`, port 8000)

| Area | What you get |
|---|---|
| **Chat** | Multi-turn chat with short-term memory (last 6 messages). You pick the model per message: a local Ollama model, a cloud provider model, or a registered agent. |
| **Document RAG** | Upload PDFs and text files. They are chunked (500 chars, 50 overlap), embedded with SentenceTransformers (`all-MiniLM-L6-v2`), stored in ChromaDB and retrieved (top-3) with sources cited in the answer. |
| **Models** | Multi-provider catalogue through the LiteLLM SDK (OpenAI, Anthropic, Gemini, Groq, Ollama and more). Each team activates its own models and stores its own API keys, which are Fernet-encrypted at rest. |
| **MCP servers** | Register MCP servers and browse their tools. Tools are injected into chat as OpenAI-style function tools and run in an automatic tool loop (up to 5 rounds). |
| **A2A agents** | Register external agents over JSON-RPC A2A (custom endpoints) or through LiteLLM agent providers (`langgraph`, `pydantic_ai`, `bedrock_agent`, `vertex_ai_agent`, `azure_ai_agent`). Agents can be tested, invoked directly, or selected as the "model" in chat. |
| **Auth & teams** | JWT auth, team membership, `admin` / `member` roles. |
| **Budgets & credits** | Monthly token limits per team, usage logging, credit-increase requests and admin approval. |
| **Admin console** | Platform stats, team management, limit changes, credit request review. |

### LLM Configurator (`llm-configurator/`, port 8001)

| Area | What you get |
|---|---|
| **LLM Catalogue** | A global list of LiteLLM-supported models with encrypted credentials, reused by every config. |
| **Config builder** | Pick models, set a priority order per operation (1 = primary, 2 = first fallback, and so on) and set limits. Saving writes `configs/<usecase>_<config>.json` and hot-loads a `litellm.Router`. No restart needed. |
| **Operations** | `chat`, `vision`, `completions`, `embeddings`, `images/generations`, `audio/transcriptions`, `audio/speech`, plus custom operations. An operation route only works if the config has a model that supports it. |
| **Restrictions** | Per-model TPM / RPM, plus TPR (max tokens per request). The UI calculates these for you. |
| **Guardrails** | Built-in PII masking (regex redaction) and profanity checks, plus custom pre- and post-stage guardrail endpoints (protected against SSRF). |
| **Usage dashboard** | Per-config summary, time series, breakdowns by model and by operation, and recent logs (Recharts). |

---

## System architecture

```mermaid
flowchart TD
    subgraph FE["Vite + React frontend, localhost:5173"]
        UI["Chat, Upload, Models,<br/>MCP Servers, Agents, Admin"]
        CFG["LLM Configs, LLM Catalogue,<br/>Usage Dashboard"]
    end

    subgraph P1["Part 1: core platform, port 8000"]
        CORE["backend/main.py<br/>FastAPI"]
        R1["/auth, /chat, /models, /credit"]
        R2["/mcp, /a2a, /rag, /admin"]
    end

    subgraph P2["Part 2: LLM Configurator, port 8001"]
        GW["llm-configurator/backend/main.py<br/>FastAPI"]
        R3["/configs, /catalog, /guardrails"]
        R4["/llm/{config}/*<br/>ops + usage"]
    end

    subgraph DATA["Storage"]
        DB1[("data/cowork.db<br/>SQLite, 10 tables")]
        VEC[("data/chroma<br/>ChromaDB")]
        DB2[("configurator.db<br/>SQLite + configs/*.json")]
    end

    subgraph EXT["External services"]
        LLM["LLM providers<br/>OpenAI, Anthropic,<br/>Gemini, Groq, Ollama"]
        MCP["MCP servers"]
