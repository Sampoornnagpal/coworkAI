import requests

BASE_URL = "http://127.0.0.1:8000"

def run_verification():
    print("--- Starting verification ---")
    
    # 1. Login as Admin
    print("\n1. Logging in as admin@cowork.ai...")
    login_payload = {"email": "admin@cowork.ai", "password": "admin123"}
    resp = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    if resp.status_code != 200:
        print(f"FAILED: Login returned {resp.status_code} - {resp.text}")
        return
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("SUCCESS: Logged in successfully!")
    
    # 2. Get providers list (Models Management page)
    print("\n2. Getting models providers list...")
    resp = requests.get(f"{BASE_URL}/models/providers", headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: GET /models/providers returned {resp.status_code} - {resp.text}")
        return
    providers = resp.json()["providers"]
    provider_ids = [p["id"] for p in providers]
    print(f"Active model providers returned: {provider_ids}")
    
    a2a_providers = {"langgraph", "pydantic_ai", "bedrock_agent", "vertex_ai_agent", "azure_ai_agent"}
    intersect = a2a_providers.intersection(provider_ids)
    if intersect:
        print(f"FAILED: Found A2A providers in Models dropdown: {intersect}")
        return
    print("SUCCESS: Models dropdown does not contain A2A providers!")
    
    # 3. Get A2A provider specs
    print("\n3. Getting A2A provider specs...")
    resp = requests.get(f"{BASE_URL}/a2a/provider-specs", headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: GET /a2a/provider-specs returned {resp.status_code} - {resp.text}")
        return
    specs = resp.json()["specs"]
    print(f"A2A provider specs returned: {list(specs.keys())}")
    for k, v in specs.items():
        print(f"  {k}: name='{v['name']}', credentials={len(v['required_credentials'])} fields")
    if not specs:
        print("FAILED: No A2A provider specs returned")
        return
    print("SUCCESS: A2A provider specs retrieved correctly!")
    
    # 4. Register a LiteLLM A2A agent
    print("\n4. Registering a test LangGraph LiteLLM agent...")
    agent_payload = {
        "agent_name": "Test LangGraph Agent",
        "agent_provider": "langgraph",
        "agent_url": "", # Optional / not needed for LiteLLM agent
        "agent_description": "A verification test LangGraph agent",
        "credentials": {
            "LANGGRAPH_API_BASE": "http://localhost:2024",
            "LANGGRAPH_API_KEY": "test-api-key"
        }
    }
    resp = requests.post(f"{BASE_URL}/a2a/agents", json=agent_payload, headers=headers)
    if resp.status_code not in (200, 409):
        print(f"FAILED: Registering A2A agent returned {resp.status_code} - {resp.text}")
        return
    if resp.status_code == 409:
        print("SUCCESS: Agent already registered (confirms persistence)!")
    else:
        print("SUCCESS: Agent registered successfully!")
        
    # 5. List agents and check status
    print("\n5. Listing agents...")
    resp = requests.get(f"{BASE_URL}/a2a/agents", headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: GET /a2a/agents returned {resp.status_code} - {resp.text}")
        return
    agents = resp.json()["agents"]
    found_agent = None
    for a in agents:
        if a["agent_name"] == "Test LangGraph Agent":
            found_agent = a
            break
    if not found_agent:
        print("FAILED: Registered agent not found in list")
        return
    print(f"SUCCESS: Agent found in list: {found_agent}")
    if not found_agent["credentials_configured"]:
        print("FAILED: Credentials not marked as configured on agent")
        return
    print("SUCCESS: Agent credentials verified as configured!")
    
    # 6. Verify if the registered LiteLLM agent appears as a model in Chat dropdown
    print("\n6. Checking if registered agent appears in active chat models...")
    resp = requests.get(f"{BASE_URL}/models/active", headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: GET /models/active returned {resp.status_code} - {resp.text}")
        return
    models = resp.json()["models"]
    model_strings = [m["model_string"] for m in models]
    print(f"Active models in chat: {model_strings}")
    expected_model_string = found_agent["model_string"]
    if expected_model_string not in model_strings:
        print(f"FAILED: Expected model string '{expected_model_string}' not found in active chat models")
        return
    print(f"SUCCESS: Registered agent model string '{expected_model_string}' is available in active models!")
    
    # 7. Clean up by deleting the agent
    print("\n7. Cleaning up (deleting the registered agent)...")
    agent_id = found_agent["id"]
    resp = requests.delete(f"{BASE_URL}/a2a/agents/{agent_id}", headers=headers)
    if resp.status_code != 200:
        print(f"FAILED: DELETE /a2a/agents/{agent_id} returned {resp.status_code} - {resp.text}")
        return
    print("SUCCESS: Agent deleted and cleaned up successfully!")
    
    # 8. Verify the model is removed from active chat models
    print("\n8. Checking active chat models after deletion...")
    resp = requests.get(f"{BASE_URL}/models/active", headers=headers)
    models_after = resp.json()["models"]
    model_strings_after = [m["model_string"] for m in models_after]
    if expected_model_string in model_strings_after:
        print(f"FAILED: Model string '{expected_model_string}' still present in active chat models after deletion")
        return
    print("SUCCESS: Model string successfully removed from active chat models after deletion!")
    
    print("\n==============================")
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
    print("==============================")

if __name__ == "__main__":
    run_verification()
