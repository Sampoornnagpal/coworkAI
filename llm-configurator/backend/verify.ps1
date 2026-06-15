$ErrorActionPreference = "Continue"

function Run-Curl {
    param([string]$name, [string]$cmd)
    Write-Output "`n=== Step: $name ==="
    Write-Output "> $cmd"
    Invoke-Expression $cmd
}

# 1. List configs
Run-Curl "1. List configs" "curl.exe -s -X GET http://localhost:8001/configs"

# 2. Create config
$createJson = @"
{
  `"usecase_name`": `"test`",
  `"config_name`": `"config`",
  `"operations`": {
    `"chat`": [{ `"litellm_model`": `"gemini/gemini-2.5-flash`", `"priority`": 1 }],
    `"completion`": [{ `"litellm_model`": `"gemini/gemini-2.5-flash`", `"priority`": 1 }],
    `"embedding`": [{ `"litellm_model`": `"gemini/gemini-embedding-001`", `"priority`": 1 }]
  },
  `"restrictions`": { `"tpm`": 10000, `"rpm`": 5, `"tpr`": 1000 },
  `"guardrails`": { `"pii_masking`": true, `"profanity_filter`": false }
}
"@
$createJson = $createJson -replace '"', '\"' -replace "`n", ""
Run-Curl "2. Create config" "curl.exe -s -X POST http://localhost:8001/configs -H `"Content-Type: application/json`" -d `"$createJson`""

# 3. Get config
Run-Curl "3. Get config" "curl.exe -s -X GET http://localhost:8001/configs/test_config"

# 4. Update config
$updateJson = @"
{
  `"usecase_name`": `"test`",
  `"config_name`": `"config`",
  `"operations`": {
    `"chat`": [{ `"litellm_model`": `"gemini/gemini-2.5-flash`", `"priority`": 1 }],
    `"completion`": [{ `"litellm_model`": `"gemini/gemini-2.5-flash`", `"priority`": 1 }]
  },
  `"restrictions`": { `"tpm`": 10000, `"rpm`": 5, `"tpr`": 1000 },
  `"guardrails`": { `"pii_masking`": true, `"profanity_filter`": false }
}
"@
$updateJson = $updateJson -replace '"', '\"' -replace "`n", ""
Run-Curl "4. Update config (remove embedding)" "curl.exe -s -X PUT http://localhost:8001/configs/test_config -H `"Content-Type: application/json`" -d `"$updateJson`""

# 5. Capabilities
Run-Curl "5. Get capabilities" "curl.exe -s -X GET http://localhost:8001/llm/test_config/capabilities"

# 6. Chat endpoint success
$chatJson = @"
{`"messages`": [{`"role`":`"user`", `"content`":`"Hello`"}]}
"@
$chatJson = $chatJson -replace '"', '\"' -replace "`n", ""
Run-Curl "6. Chat Request" "curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`""

# 7. PII Masking
$piiJson = @"
{`"messages`": [{`"role`":`"user`", `"content`":`"My email is admin@company.com`"}]}
"@
$piiJson = $piiJson -replace '"', '\"' -replace "`n", ""
Run-Curl "7. Chat Request with PII" "curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$piiJson`""

# 8. Completion endpoint
$compJson = @"
{`"prompt`": `"Once upon a time`"}
"@
$compJson = $compJson -replace '"', '\"' -replace "`n", ""
Run-Curl "8. Completion Request" "curl.exe -s -X POST http://localhost:8001/llm/test_config/completions -H `"Content-Type: application/json`" -d `"$compJson`""

# 9. Missing Operation (Embedding removed in step 4)
$embedJson = @"
{`"input`": `"test`"}
"@
$embedJson = $embedJson -replace '"', '\"' -replace "`n", ""
Run-Curl "9. Request missing operation (Embedding)" "curl.exe -s -X POST http://localhost:8001/llm/test_config/embeddings -H `"Content-Type: application/json`" -d `"$embedJson`""

# 10. TPR Cap rejection
$tprJson = @"
{`"messages`": [{`"role`":`"user`", `"content`":`"Hello`"}], `"max_tokens`": 5000}
"@
$tprJson = $tprJson -replace '"', '\"' -replace "`n", ""
Run-Curl "10. Exceed TPR Cap" "curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$tprJson`""

# 11. Unsupported Operation (Images)
$imgJson = @"
{`"prompt`": `"test`"}
"@
$imgJson = $imgJson -replace '"', '\"' -replace "`n", ""
Run-Curl "11. Unsupported Operation (Images)" "curl.exe -s -X POST http://localhost:8001/llm/test_config/images/generations -H `"Content-Type: application/json`" -d `"$imgJson`""

# 12. Rate limit triggers
Run-Curl "12. Hit Rate Limit (Spam)" "curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`" ; curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`" ; curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`" ; curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`" ; curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`""

# 13. Usage endpoint
Run-Curl "13. Check Usage Logs" "curl.exe -s -X GET http://localhost:8001/llm/test_config/usage"

# 14. Delete Config
Run-Curl "14. Delete Config" "curl.exe -s -X DELETE http://localhost:8001/configs/test_config"

# 15. Evicted endpoint returns 404
Run-Curl "15. Evicted endpoint 404" "curl.exe -s -X POST http://localhost:8001/llm/test_config/chat -H `"Content-Type: application/json`" -d `"$chatJson`""
