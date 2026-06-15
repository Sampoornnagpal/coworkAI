@echo off
echo === Step: 0. Mode-mismatch create rejection ===
curl.exe -s -X POST http://localhost:8001/configs -H "Content-Type: application/json" -d "{\"usecase_name\": \"test\", \"config_name\": \"badconfig\", \"operations\": {\"chat\": [{\"litellm_model\": \"gemini/gemini-embedding-001\", \"priority\": 1, \"api_key_env\": \"GEMINI_API_KEY\"}]}, \"restrictions\": {\"tpm\": 10000, \"rpm\": 5, \"tpr\": 1000}, \"guardrails\": {\"pii_masking\": true, \"profanity_filter\": false}}"
echo.
echo.

echo === Step: 1. Create config properly ===
curl.exe -s -X POST http://localhost:8001/configs -H "Content-Type: application/json" -d "{\"usecase_name\": \"test\", \"config_name\": \"config\", \"operations\": {\"chat\": [{\"litellm_model\": \"gemini/gemini-2.5-flash\", \"priority\": 1, \"api_key_env\": \"GEMINI_API_KEY\"}, {\"litellm_model\": \"ollama_chat/llama3.1\", \"priority\": 2, \"api_base\": \"http://localhost:11434\"}], \"embedding\": [{\"litellm_model\": \"ollama/nomic-embed-text\", \"priority\": 1, \"api_base\": \"http://localhost:11434\"}]}, \"restrictions\": {\"tpm\": 10000, \"rpm\": 5, \"tpr\": 1000}, \"guardrails\": {\"pii_masking\": true, \"profanity_filter\": false}}"
echo.
echo.

echo === Step: 2. Fallback /chat (poisoned key leads to ollama_chat/llama3.1) ===
curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Hello\"}]}"
echo.
echo.

echo === Step: 3. /embeddings success ===
curl.exe -s -X POST http://localhost:8001/llm/test_config/embeddings -H "Content-Type: application/json" -d "{\"input\": [\"test embedding\"]}"
echo.
echo.

echo === Step: 4. PII masking test ===
curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"My email is test@x.com\"}]}"
echo.
echo.

echo === Step: 5. X-Agent-ID: extractor call ===
curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -H "X-Agent-ID: extractor" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Extract data\"}]}"
echo.
echo.

echo === Step: 6. Check /usage for agents rollup ===
curl.exe -s -X GET http://localhost:8001/llm/test_config/usage
echo.
echo.

echo === Step: 7. Restart Persistence Test (Live /chat) ===
curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Persistence test\"}]}"
echo.
echo.
