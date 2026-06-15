import re
from typing import Dict, Tuple, Generator, Any

class PIIShield:
    def __init__(self, model_id: str = "openai/privacy-filter"):
        self.model_id = model_id
        self.pipeline = None
        self._is_loaded = False

    def load_model(self):
        if self._is_loaded:
            return
        
        # Check settings toggle before loading to save local dev memory
        from backend.config import settings
        if not getattr(settings, "ENABLE_PII_GUARDRAIL", False):
            print("[PIIShield] ENABLE_PII_GUARDRAIL is False. Skipping model loading entirely.")
            self.pipeline = None
            self._is_loaded = True
            return
        
        # Security validation: Enforce official repository only
        if self.model_id != "openai/privacy-filter":
            raise ValueError(f"Security Alert: Unauthorized Hugging Face repository identifier: {self.model_id}")
            
        try:
            from transformers import pipeline
            import torch
            
            # Auto-detect CUDA capability
            device = 0 if torch.cuda.is_available() else -1
            print(f"[PIIShield] Loading local PII model '{self.model_id}' on device={device}...")
            
            self.pipeline = pipeline(
                "token-classification",
                model=self.model_id,
                aggregation_strategy="simple",
                device=device,
                trust_remote_code=True
            )
            self._is_loaded = True
            print("[PIIShield] Local PII model loaded successfully.")
        except Exception as e:
            print(f"[PIIShield] Error loading model '{self.model_id}': {e}. Falling back to Regex.")
            self.pipeline = None
            self._is_loaded = True

    def redact(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Scans text for PII using openai/privacy-filter.
        Replaces detected spans with unique placeholders and returns (redacted_text, mapping).
        Runs synchronously (should be wrapped in anyio.to_thread.run_sync when called from async contexts).
        """
        if not text:
            return text, {}
            
        from backend.config import settings
        if not getattr(settings, "ENABLE_PII_GUARDRAIL", False):
            return text, {}
            
        # Ensure model is initialized (lazy loaded)
        self.load_model()
        
        if self.pipeline is not None:
            try:
                # Perform model inference
                results = self.pipeline(text)
                
                # Sort spans left-to-right (ascending start index) to assign sequential counts
                entities = sorted(results, key=lambda x: x['start'])
                
                # Prevent overlapping spans
                filtered_entities = []
                last_end = -1
                for ent in entities:
                    if ent['start'] >= last_end:
                        filtered_entities.append(ent)
                        last_end = ent['end']
                
                entity_counts = {}
                for ent in filtered_entities:
                    label = ent.get('entity_group', ent.get('entity', 'PII'))
                    label_clean = label.upper().replace("PRIVATE_", "").replace("ACCOUNT_", "")
                    
                    if label_clean not in entity_counts:
                        entity_counts[label_clean] = 0
                    entity_counts[label_clean] += 1
                    ent["placeholder"] = f"[{label_clean}_{entity_counts[label_clean]}]"
                
                # Sort filtered matches right-to-left (descending start index) for safe splicing
                filtered_entities = sorted(filtered_entities, key=lambda x: x['start'], reverse=True)
                
                redacted_text = text
                mapping = {}
                for ent in filtered_entities:
                    start = ent['start']
                    end = ent['end']
                    placeholder = ent["placeholder"]
                    original_val = text[start:end]
                    
                    redacted_text = redacted_text[:start] + placeholder + redacted_text[end:]
                    mapping[placeholder] = original_val
                    
                return redacted_text, mapping
            except Exception as e:
                print(f"[PIIShield] Inference failed, falling back to regex: {e}")
                
        # High-performance right-to-left regex fallback
        return self._regex_redact(text)

    def _regex_redact(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Slices PII using re.finditer and right-to-left splicing to match primary model behavior.
        """
        patterns = {
            "EMAIL": r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]*[a-zA-Z0-9]',
            "PHONE": r'\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}'
        }
        
        matches = []
        for label, pattern in patterns.items():
            for match in re.finditer(pattern, text):
                start, end = match.span()
                matched_text = match.group()
                
                # Phone number specific length validation
                if label == "PHONE" and len(re.sub(r'\D', '', matched_text)) < 7:
                    continue
                    
                matches.append({
                    "label": label,
                    "start": start,
                    "end": end,
                    "text": matched_text
                })
        
        # 1. Sort matches left-to-right (ascending start index) to assign sequential counts
        matches = sorted(matches, key=lambda x: x['start'])
        
        # Prevent overlapping/nested matches
        filtered_matches = []
        last_end = -1
        for match in matches:
            if match["start"] >= last_end:
                filtered_matches.append(match)
                last_end = match["end"]
        
        entity_counts = {}
        for match in filtered_matches:
            label = match["label"]
            if label not in entity_counts:
                entity_counts[label] = 0
            entity_counts[label] += 1
            match["placeholder"] = f"[{label}_{entity_counts[label]}]"
            
        # 2. Sort filtered matches right-to-left (descending start index) for safe splicing
        filtered_matches = sorted(filtered_matches, key=lambda x: x['start'], reverse=True)
        
        redacted_text = text
        mapping = {}
        for match in filtered_matches:
            start = match["start"]
            end = match["end"]
            placeholder = match["placeholder"]
            original_val = match["text"]
            
            # Splice right-to-left
            redacted_text = redacted_text[:start] + placeholder + redacted_text[end:]
            mapping[placeholder] = original_val
            
        return redacted_text, mapping

    def restore(self, redacted_text: str, mapping: Dict[str, str]) -> str:
        """Restores original PII values into the redacted text using the provided mapping."""
        if not redacted_text or not mapping:
            return redacted_text
            
        restored_text = redacted_text
        for placeholder, original in mapping.items():
            restored_text = restored_text.replace(placeholder, original)
            
        return restored_text

    def restore_stream(self, chunk_generator: Generator[Any, None, None], mapping: Dict[str, str]) -> Generator[str, None, None]:
        """
        Streaming-compatible token restorer. Buffers incoming stream chunks
        until it detects fully complete [ and ] boundaries, then yields restored text on the fly.
        """
        buffer = ""
        for chunk in chunk_generator:
            # Extract content from chunk object or use as string
            chunk_text = chunk
            if not isinstance(chunk, str):
                try:
                    chunk_text = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError, TypeError):
                    try:
                        chunk_text = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "") or ""
                    except (AttributeError, KeyError, IndexError, TypeError):
                        chunk_text = str(chunk)
            
            buffer += chunk_text
            
            # Yield completed boundaries on the fly
            while True:
                open_idx = buffer.find('[')
                if open_idx == -1:
                    # No open brackets, output everything safely
                    if buffer:
                        yield buffer
                        buffer = ""
                    break
                
                # Yield text preceding the open bracket
                if open_idx > 0:
                    yield buffer[:open_idx]
                    buffer = buffer[open_idx:]
                
                # Check for closing bracket
                close_idx = buffer.find(']')
                if close_idx == -1:
                    # Closing bracket not received yet, keep buffering
                    # Prevent runaway buffering if a stray "[" is encountered
                    if len(buffer) > 100:
                        yield buffer[0]
                        buffer = buffer[1:]
                        continue
                    break
                
                # Extract placeholder, restore, and clear buffer up to the closing bracket
                placeholder = buffer[:close_idx + 1]
                restored = mapping.get(placeholder, placeholder)
                yield restored
                buffer = buffer[close_idx + 1:]
                
        # Yield any remaining string at end of stream
        if buffer:
            yield buffer

# Global singleton instance
pii_shield = PIIShield()
