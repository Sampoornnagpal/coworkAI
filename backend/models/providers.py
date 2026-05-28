import os
import sys

BASE_PROVIDERS = {
    "openai": {
        "name": "OpenAI",
        "required_credentials": [
            {"key": "OPENAI_API_KEY", "label": "API Key", "type": "password", "placeholder": "sk-..."}
        ],
        "default_models": [
            {"name": "GPT-4o", "model_string": "openai/gpt-4o", "description": "Most capable model"},
            {"name": "GPT-4o Mini", "model_string": "openai/gpt-4o-mini", "description": "Fast and affordable"},
            {"name": "GPT-4 Turbo", "model_string": "openai/gpt-4-turbo", "description": "Previous generation"},
        ],
        "litellm_keys": ["openai", "text-completion-openai"]
    },
    "anthropic": {
        "name": "Anthropic",
        "required_credentials": [
            {"key": "ANTHROPIC_API_KEY", "label": "API Key", "type": "password", "placeholder": "sk-ant-..."}
        ],
        "default_models": [
            {"name": "Claude Sonnet 4.5", "model_string": "anthropic/claude-sonnet-4-5-20250929", "description": "Latest balanced model"},
            {"name": "Claude Haiku 4.5", "model_string": "anthropic/claude-haiku-4-5-20251001", "description": "Fastest Claude model"},
        ],
        "litellm_keys": ["anthropic"]
    },
    "azure": {
        "name": "Azure OpenAI",
        "required_credentials": [
            {"key": "AZURE_API_KEY", "label": "API Key", "type": "password", "placeholder": "your-azure-key"},
            {"key": "AZURE_API_BASE", "label": "Endpoint URL", "type": "text", "placeholder": "https://your-resource.openai.azure.com"},
            {"key": "AZURE_API_VERSION", "label": "API Version", "type": "text", "placeholder": "2024-02-01"},
        ],
        "default_models": [
            {"name": "GPT-4o (Azure)", "model_string": "azure/gpt-4o", "description": "GPT-4o on Azure"},
            {"name": "GPT-4 (Azure)", "model_string": "azure/gpt-4", "description": "GPT-4 on Azure"},
        ],
        "litellm_keys": ["azure", "azure_ai", "azure_text"]
    },
    "gemini": {
        "name": "Google Gemini",
        "required_credentials": [
            {"key": "GEMINI_API_KEY", "label": "API Key", "type": "password", "placeholder": "AI..."}
        ],
        "default_models": [
            {"name": "Gemini 2.5 Flash", "model_string": "gemini/gemini-2.5-flash", "description": "Fast and capable Flash model"},
            {"name": "Gemini 3.5 Flash", "model_string": "gemini/gemini-3.5-flash", "description": "Latest Flash model"},
            {"name": "Gemini Flash Latest", "model_string": "gemini/gemini-flash-latest", "description": "Stable alias for latest Flash model"},
            {"name": "Gemini 2.5 Pro", "model_string": "gemini/gemini-2.5-pro", "description": "Most capable Gemini (subject to higher rate limits)"},
            {"name": "Gemini Pro Latest", "model_string": "gemini/gemini-pro-latest", "description": "Stable alias for latest Pro model"},
        ],
        "litellm_keys": ["gemini", "vertex_ai"]
    },
    "groq": {
        "name": "Groq",
        "required_credentials": [
            {"key": "GROQ_API_KEY", "label": "API Key", "type": "password", "placeholder": "gsk_..."}
        ],
        "default_models": [
            {"name": "Llama 3.3 70B", "model_string": "groq/llama-3.3-70b-versatile", "description": "Latest high-capability Llama model on Groq"},
            {"name": "Llama 3.1 8B", "model_string": "groq/llama-3.1-8b-instant", "description": "Fast efficient Llama on Groq"},
        ],
        "litellm_keys": ["groq"]
    },
    "mistral": {
        "name": "Mistral AI",
        "required_credentials": [
            {"key": "MISTRAL_API_KEY", "label": "API Key", "type": "password", "placeholder": "your-mistral-key"}
        ],
        "default_models": [
            {"name": "Mistral Large", "model_string": "mistral/mistral-large-latest", "description": "Most capable Mistral"},
            {"name": "Mistral Small", "model_string": "mistral/mistral-small-latest", "description": "Fast and efficient"},
        ],
        "litellm_keys": ["mistral", "codestral"]
    },
    "cohere": {
        "name": "Cohere",
        "required_credentials": [
            {"key": "COHERE_API_KEY", "label": "API Key", "type": "password", "placeholder": "your-cohere-key"}
        ],
        "default_models": [
            {"name": "Command R+", "model_string": "cohere/command-r-plus", "description": "RAG-optimized model"},
            {"name": "Command R", "model_string": "cohere/command-r", "description": "Efficient generation"},
        ],
        "litellm_keys": ["cohere", "cohere_chat"]
    },
    "together_ai": {
        "name": "Together AI",
        "required_credentials": [
            {"key": "TOGETHERAI_API_KEY", "label": "API Key", "type": "password", "placeholder": "your-together-key"}
        ],
        "default_models": [
            {"name": "Llama 3.1 405B", "model_string": "together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", "description": "Largest open model"},
            {"name": "Mixtral 8x22B", "model_string": "together_ai/mistralai/Mixtral-8x22B-Instruct-v0.1", "description": "Large mixture of experts"},
        ],
        "litellm_keys": ["together_ai"]
    },
    "langgraph": {
        "name": "LangGraph Agent",
        "required_credentials": [
            {"key": "LANGGRAPH_API_BASE", "label": "Agent Base URL", "type": "text", "placeholder": "http://localhost:2024"},
            {"key": "LANGGRAPH_API_KEY", "label": "API Key (Optional)", "type": "password", "placeholder": "..."}
        ],
        "default_models": [
            {"name": "LangGraph A2A Agent", "model_string": "langgraph/default-agent", "description": "Custom LangGraph Agent"}
        ],
        "litellm_keys": ["langgraph"]
    },
    "pydantic_ai": {
        "name": "Pydantic AI Agent",
        "required_credentials": [
            {"key": "PYDANTIC_AI_API_BASE", "label": "Agent Base URL", "type": "text", "placeholder": "http://localhost:9999"}
        ],
        "default_models": [
            {"name": "Pydantic AI A2A Agent", "model_string": "a2a/default-agent", "description": "Custom Pydantic AI Agent"}
        ],
        "litellm_keys": ["pydantic_ai"]
    },
    "bedrock_agent": {
        "name": "Bedrock Agent",
        "required_credentials": [
            {"key": "AWS_ACCESS_KEY_ID", "label": "AWS Access Key", "type": "password", "placeholder": "AKIA..."},
            {"key": "AWS_SECRET_ACCESS_KEY", "label": "AWS Secret Key", "type": "password", "placeholder": "..."},
            {"key": "AWS_REGION_NAME", "label": "AWS Region", "type": "text", "placeholder": "us-east-1"},
            {"key": "BEDROCK_AGENT_ARN", "label": "Bedrock Agent ARN / ID", "type": "text", "placeholder": "arn:aws:bedrock:us-east-1:123456789012:agent/ABC123XYZ"}
        ],
        "default_models": [
            {"name": "Bedrock A2A Agent", "model_string": "bedrock-agent/default-agent", "description": "AWS Bedrock Agent"}
        ],
        "litellm_keys": ["bedrock_agent"]
    },
    "vertex_ai_agent": {
        "name": "Vertex AI Agent",
        "required_credentials": [
            {"key": "VERTEX_PROJECT", "label": "GCP Project ID", "type": "text", "placeholder": "my-gcp-project"},
            {"key": "VERTEX_LOCATION", "label": "GCP Location", "type": "text", "placeholder": "us-central1"},
            {"key": "VERTEX_REASONING_ENGINE_ID", "label": "Reasoning Engine Resource ID", "type": "text", "placeholder": "projects/123456789/locations/us-central1/reasoningEngines/987654321"}
        ],
        "default_models": [
            {"name": "Vertex AI A2A Agent", "model_string": "vertex_ai/default-agent", "description": "Google Vertex AI Agent"}
        ],
        "litellm_keys": ["vertex_ai_agent"]
    },
    "azure_ai_agent": {
        "name": "Azure AI Agent",
        "required_credentials": [
            {"key": "AZURE_AI_TENANT_ID", "label": "Azure Tenant ID", "type": "password", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "AZURE_AI_CLIENT_ID", "label": "Azure Client ID", "type": "password", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "AZURE_AI_CLIENT_SECRET", "label": "Azure Client Secret", "type": "password", "placeholder": "your-client-secret"},
            {"key": "AZURE_AI_API_BASE", "label": "Azure AI Foundry Endpoint", "type": "text", "placeholder": "https://your-resource.services.ai.azure.com/api/projects/your-project"},
            {"key": "AZURE_AGENT_ID", "label": "Azure Agent ID", "type": "text", "placeholder": "asst_abc123xyz"}
        ],
        "default_models": [
            {"name": "Azure AI A2A Agent", "model_string": "azure_ai/default-agent", "description": "Azure AI Agent"}
        ],
        "litellm_keys": ["azure_ai_agent"]
    }
}

def _get_clean_model_name(model_string: str, provider_key: str) -> str:
    name = model_string
    # Remove common prefixes if present
    for prefix in [provider_key + "/", "ollama/", "openai/", "anthropic/", "gemini/", "groq/", "mistral/", "cohere/", "together_ai/", "azure/", "langgraph/", "pydantic-ai/", "bedrock-agent/", "vertex_ai/", "azure_ai/"]:
        if name.lower().startswith(prefix.lower()):
            name = name[len(prefix):]
    
    parts = name.replace("-", " ").replace("_", " ").split()
    uppercases = {"gpt", "llm", "ai", "rag", "nlp", "id", "api", "tts", "stt", "v3", "v2", "v1"}
    cleaned_parts = []
    for p in parts:
        if p.lower() in uppercases:
            cleaned_parts.append(p.upper())
        elif p.lower().startswith("gpt") or p.lower().startswith("claude") or p.lower().startswith("llama"):
            cleaned_parts.append(p.capitalize())
        else:
            cleaned_parts.append(p.capitalize())
    return " ".join(cleaned_parts)

def _build_supported_providers():
    providers = {}
    try:
        import litellm
        for p_id, p_info in BASE_PROVIDERS.items():
            providers[p_id] = {
                "name": p_info["name"],
                "required_credentials": p_info["required_credentials"],
                "models": list(p_info["default_models"])
            }
            
            # Keep track of already added model strings to prevent duplicates
            added_model_strings = {m["model_string"] for m in p_info["default_models"]}
            
            # Retrieve models from litellm models_by_provider
            for l_key in p_info["litellm_keys"]:
                litellm_models = litellm.models_by_provider.get(l_key, set())
                for model in litellm_models:
                    # Normalize model string
                    # If it already contains /, keep it as is
                    # Otherwise, prepend the provider ID/
                    if "/" in model:
                        model_str = model
                    else:
                        model_str = f"{p_id}/{model}"
                    
                    if model_str in added_model_strings:
                        continue
                    
                    display_name = _get_clean_model_name(model, p_id)
                    providers[p_id]["models"].append({
                        "name": display_name,
                        "model_string": model_str,
                        "description": f"Supported by LiteLLM ({p_info['name']})"
                    })
                    added_model_strings.add(model_str)
    except Exception as e:
        # Fallback to hardcoded list if litellm or any dynamic parsing fails
        print(f"[AI Cowork] Failed to dynamically load models from LiteLLM, falling back: {e}")
        for p_id, p_info in BASE_PROVIDERS.items():
            providers[p_id] = {
                "name": p_info["name"],
                "required_credentials": p_info["required_credentials"],
                "models": list(p_info["default_models"])
            }
    return providers

SUPPORTED_PROVIDERS = _build_supported_providers()
