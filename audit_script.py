import requests

# 1. Check health
print('--- Health Check ---')
try:
    r = requests.get('http://127.0.0.1:8000/health')
    print('Status:', r.status_code, r.json())
except Exception as e:
    print('Failed:', e)

# 2. Login to get token (using default seeded admin user)
print('\n--- Login Admin ---')
token = None
try:
    r = requests.post('http://127.0.0.1:8000/auth/login', json={'email': 'admin@cowork.ai', 'password': 'admin123'})
    if r.status_code == 200:
        token = r.json().get('access_token')
        print('Login Success!')
    else:
        print('Login Failed:', r.status_code, r.text)
except Exception as e:
    print('Login error:', e)

if token:
    headers = {'Authorization': f'Bearer {token}'}
    
    # 3. Check A2A Provider Specs (Should contain our Azure/Pydantic AI changes)
    print('\n--- Provider Specs ---')
    r = requests.get('http://127.0.0.1:8000/a2a/provider-specs', headers=headers)
    specs = r.json().get('specs', {})
    
    pydantic = specs.get('pydantic_ai', {})
    print('Pydantic AI Required Creds:', [c.get('key') for c in pydantic.get('required_credentials', [])])
    
    azure = specs.get('azure_ai_agent', {})
    print('Azure AI Required Creds:', [c.get('key') for c in azure.get('required_credentials', [])])
    
    # 4. Create and test a fake Pydantic AI agent registration
    print('\n--- Register Pydantic AI Agent ---')
    payload = {
        'agent_name': 'audit-test-agent',
        'agent_provider': 'pydantic_ai',
        'credentials': {
            'PYDANTIC_AI_API_BASE': 'http://localhost:9999'
        }
    }
    r = requests.post('http://127.0.0.1:8000/a2a/agents', json=payload, headers=headers)
    print('Register Response:', r.status_code, r.text)
    
    # 5. List agents and check the model string generated
    print('\n--- List Agents ---')
    r = requests.get('http://127.0.0.1:8000/a2a/agents', headers=headers)
    agents = r.json().get('agents', [])
    test_agent = next((a for a in agents if a['agent_name'] == 'audit-test-agent'), None)
    if test_agent:
        print('Generated Model String:', test_agent.get('model_string'))
        print('Credentials Configured:', test_agent.get('credentials_configured'))
        
        # 6. Clean up
        print('\n--- Cleanup ---')
        d = requests.delete(f"http://127.0.0.1:8000/a2a/agents/{test_agent['id']}", headers=headers)
        print('Delete Agent:', d.status_code)
