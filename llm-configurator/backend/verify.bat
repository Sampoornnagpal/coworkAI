@echo off
echo === Step: 1. List configs ===
curl -s -X GET http://localhost:8001/configs
echo.
echo.

echo === Step: 2. Create config ===
curl -s -X POST http://localhost:8001/configs -H "Content-Type: application/json" -d "{\"usecase_name\": \"test\", \"config_name\": \"config\", \"operations\": {\"chat\": [{\"litellm_model\": \"gemini/gemini-2.5-flash\", \"priority\": 1}], \"completion\": [{\"litellm_model\": \"custom/completion\", \"priority\": 1, \"api_base\": \"http://localhost:11434\"}], \"embedding\": [{\"litellm_model\": \"custom/embedding\", \"priority\": 1, \"api_base\": \"http://localhost:11434\"}]}, \"restrictions\": {\"tpm\": 10000, \"rpm\": 5, \"tpr\": 1000}, \"guardrails\": {\"pii_masking\": true, \"profanity_filter\": false}}"
echo.
echo.

echo === Step: 3. Get config ===
curl -s -X GET http://localhost:8001/configs/test_config
echo.
echo.

echo === Step: 4. Update config (remove embedding) ===
curl -s -X PUT http://localhost:8001/configs/test_config -H "Content-Type: application/json" -d "{\"usecase_name\": \"test\", \"config_name\": \"config\", \"operations\": {\"chat\": [{\"litellm_model\": \"gemini/gemini-2.5-flash\", \"priority\": 1}], \"completion\": [{\"litellm_model\": \"custom/completion\", \"priority\": 1, \"api_base\": \"http://localhost:11434\"}]}, \"restrictions\": {\"tpm\": 10000, \"rpm\": 5, \"tpr\": 1000}, \"guardrails\": {\"pii_masking\": true, \"profanity_filter\": false}}"
echo.
echo.

echo === Step: 5. Get capabilities ===
curl -s -X GET http://localhost:8001/llm/test_config/capabilities
echo.
echo.

echo === Step: 6. Chat Request ===
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Hello!\"}]}"
echo.
echo.

echo === Step: 7. Chat Request with PII ===
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"My email is admin@company.com\"}]}"
echo.
echo.

echo === Step: 8. Completion Request ===
curl -s -X POST http://localhost:8001/llm/test_config/completions -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\"}"
echo.
echo.

echo === Step: 9. Request missing operation (Embedding) ===
curl -s -X POST http://localhost:8001/llm/test_config/embeddings -H "Content-Type: application/json" -d "{\"input\": \"test\"}"
echo.
echo.

echo === Step: 10. Exceed TPR Cap ===
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Hello\"}], \"max_tokens\": 5000}"
echo.
echo.

echo === Step: 11. Unsupported Operation (Images) ===
curl -s -X POST http://localhost:8001/llm/test_config/images/generations -H "Content-Type: application/json" -d "{\"prompt\": \"test\"}"
echo.
echo.

echo === Step: 12. Hit Rate Limit (Spam) ===
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 1\"}]}"
echo.
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 2\"}]}"
echo.
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 3\"}]}"
echo.
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 4\"}]}"
echo.
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 5\"}]}"
echo.
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Rate limit 6\"}]}"
echo.
echo.

echo === Step: 13. Check Usage Logs ===
curl -s -X GET http://localhost:8001/llm/test_config/usage
echo.
echo.

echo === Step: 14. Delete Config ===
curl -s -X DELETE http://localhost:8001/configs/test_config
echo.
echo.

echo === Step: 15. Evicted endpoint 404 ===
curl -s -X POST http://localhost:8001/llm/test_config/chat -H "Content-Type: application/json" -d "{\"messages\": [{\"role\":\"user\", \"content\":\"Hello\"}]}"
echo.
echo.
