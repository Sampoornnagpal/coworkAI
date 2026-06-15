import litellm
import logging
from schemas import CatalogModel, EndpointSpec
from typing import List

logger = logging.getLogger(__name__)

# Pre-defined mapping of our operations to the underlying litellm behavior
OPERATIONS_SPEC = [
    EndpointSpec(
        operation="chat",
        path="/llm/{name}/chat",
        request_shape='{"messages":[{"role":"user","content":"..."}]}',
        litellm_function="router.acompletion"
    ),
    EndpointSpec(
        operation="vision",
        path="/llm/{name}/vision",
        request_shape='{"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"..."}}]}]}',
        litellm_function="router.acompletion",
        derived=True
    ),
    EndpointSpec(
        operation="completion",
        path="/llm/{name}/completions",
        request_shape='{"prompt":"..."}',
        litellm_function="router.atext_completion"
    ),
    EndpointSpec(
        operation="embedding",
        path="/llm/{name}/embeddings",
        request_shape='{"input":"..."}',
        litellm_function="router.aembedding"
    ),
    EndpointSpec(
        operation="image_generation",
        path="/llm/{name}/images/generations",
        request_shape='{"prompt":"...", "n":1, "size":"1024x1024"}',
        litellm_function="router.aimage_generation"
    ),
    EndpointSpec(
        operation="audio_transcription",
        path="/llm/{name}/audio/transcriptions",
        request_shape="multipart/form-data with 'file'",
        litellm_function="router.atranscription"
    ),
    EndpointSpec(
        operation="audio_speech",
        path="/llm/{name}/audio/speech",
        request_shape='{"input":"...", "voice":"alloy"}',
        litellm_function="router.aspeech"
    )
]

def get_models_catalog(provider_filter: str = None, mode_filter: str = None, query: str = None) -> List[CatalogModel]:
    results = []
    
    for model_key, details in litellm.model_cost.items():
        try:
            if model_key == "sample_spec":
                continue
                
            if not isinstance(details, dict):
                continue
                
            mode = details.get("mode")
            if not mode:
                continue
                
            provider = str(details.get("litellm_provider") or "other")
            
            if provider_filter and provider_filter.lower() != provider.lower():
                continue
                
            if mode_filter and mode_filter.lower() != mode.lower():
                continue
                
            if query and query.lower() not in model_key.lower():
                continue
                
            max_tokens = details.get("max_tokens")
            if max_tokens is not None:
                try:
                    max_tokens = int(max_tokens)
                except (ValueError, TypeError):
                    max_tokens = None
                    
            supports_vision = bool(details.get("supports_vision"))
            
            results.append(CatalogModel(
                provider=provider,
                model_key=model_key,
                mode=mode,
                supports_vision=supports_vision,
                max_tokens=max_tokens
            ))
        except Exception as e:
            logger.warning(f"Skipping model {model_key}: {e}")
            continue
        
    return results

def get_operations_catalog() -> List[EndpointSpec]:
    return OPERATIONS_SPEC
