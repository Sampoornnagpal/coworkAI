import litellm

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
}

def get_clean_model_name(model_string: str, provider_key: str) -> str:
    name = model_string
    # Remove prefix if present
    for prefix in [provider_key + "/", "ollama/", "openai/", "anthropic/", "gemini/", "groq/", "mistral/", "cohere/", "together_ai/", "azure/"]:
        if name.startswith(prefix):
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

def build_supported_providers():
    providers = {}
    for p_id, p_info in BASE_PROVIDERS.items():
        # Copy basic details
        providers[p_id] = {
            "name": p_info["name"],
            "required_credentials": p_info["required_credentials"],
            "models": list(p_info["default_models"])
        }
        
        # Track already added model strings to avoid duplicates
        added_model_strings = {m["model_string"] for m in p_info["default_models"]}
        
        # Fetch from litellm models_by_provider
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
                
                # Check for duplicate
                if model_str in added_model_strings:
                    continue
                
                # Create clean display name
                display_name = get_clean_model_name(model, p_id)
                
                providers[p_id]["models"].append({
                    "name": display_name,
                    "model_string": model_str,
                    "description": f"Supported by LiteLLM ({p_info['name']})"
                })
                added_model_strings.add(model_str)
                
    return providers

supported = build_supported_providers()
print("Done! Model counts:")
for p, info in supported.items():
    print(f"- {p}: {len(info['models'])} models")
