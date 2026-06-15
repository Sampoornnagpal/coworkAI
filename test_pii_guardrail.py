import anyio
import sys
import os

# Add current directory to path so imports work
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from backend.guardrails.pii_shield import pii_shield
from backend.config import settings

async def test_all():
    # Force enable for test duration
    settings.ENABLE_PII_GUARDRAIL = True

    # 1. Test Asynchronous offloading
    print("--- Test 1: Async non-blocking offloading ---")
    text = "Hi, my email is bob@example.com."
    redacted, mapping = await anyio.to_thread.run_sync(pii_shield.redact, text)
    print(f"Redacted: {redacted}")
    print(f"Mapping:  {mapping}")
    assert "[EMAIL_1]" in redacted
    assert mapping.get("[EMAIL_1]") == "bob@example.com"

    # 2. Test Stream Buffer Real-time yielding
    print("--- Test 2: Stream Buffer Real-time yielding ---")
    chunks = ["Hello ", "world, ", "my email ", "is ", "[", "EMAIL", "_1", "]! See ", "you."]
    restored_chunks = list(pii_shield.restore_stream(chunks, {"[EMAIL_1]": "bob@example.com"}))
    print(f"Chunks:   {chunks}")
    print(f"Restored: {restored_chunks}")
    assert "bob@example.com" in "".join(restored_chunks)
    assert "[EMAIL_1]" not in "".join(restored_chunks)

    # 3. Test re.finditer Right-to-Left splicing fallback
    print("--- Test 3: re.finditer Right-to-Left splicing ---")
    fallback_text = "Contact adam@mail.com or macadam@mail.com now."
    redacted_f, mapping_f = pii_shield._regex_redact(fallback_text)
    print(f"Fallback original: {fallback_text}")
    print(f"Fallback redacted: {redacted_f}")
    print(f"Fallback mapping:  {mapping_f}")
    assert "[EMAIL_1]" in redacted_f and "[EMAIL_2]" in redacted_f
    assert "mac[EMAIL_1]" not in redacted_f  # Assert no substring corruption
    assert mapping_f.get("[EMAIL_1]") == "adam@mail.com"
    assert mapping_f.get("[EMAIL_2]") == "macadam@mail.com"

    # 4. Security validation checks
    print("--- Test 4: Security typosquatted model load block ---")
    try:
        from backend.guardrails.pii_shield import PIIShield
        bad = PIIShield("Open-OSS/privacy-filter")
        bad.load_model()
        print("FAILED: Did not block invalid model!")
    except ValueError as e:
        print(f"Security blocked typosquatted model: {e}")
        assert "Security Alert" in str(e)

    print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    anyio.run(test_all)
