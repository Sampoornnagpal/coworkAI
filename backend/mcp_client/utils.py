import json
import requests as http_requests
from backend.auth.encryption import decrypt_secret

def _build_headers(server):
    """Build HTTP headers including auth for an MCP server."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    auth_val = server["auth_value"] if "auth_value" in server.keys() else None
    decrypted_auth = decrypt_secret(auth_val) if auth_val else None
    if server["auth_type"] == "bearer_token" and decrypted_auth:
        headers["Authorization"] = f"Bearer {decrypted_auth}"
    elif server["auth_type"] == "api_key" and decrypted_auth:
        headers["X-API-Key"] = decrypted_auth
    return headers


def _parse_sse_response(response):
    """Parse SSE or plain JSON response from an MCP server."""
    for line in response.iter_lines():
        if not line:
            continue
        decoded = line.decode("utf-8") if isinstance(line, bytes) else line
        # Handle SSE format (data: {...})
        if decoded.startswith("data: "):
            try:
                return json.loads(decoded[6:])
            except json.JSONDecodeError:
                continue
        # Handle plain JSON format
        try:
            return json.loads(decoded)
        except json.JSONDecodeError:
            continue
    return None


def get_all_mcp_tools(db):
    """
    Iterates over all active MCP servers, pings their tools/list endpoints,
    and returns a combined list of OpenAI-formatted tools.
    """
    servers = db.execute("SELECT * FROM mcp_servers WHERE is_active = 1").fetchall()
    
    all_tools = []
    # Map tool name -> server_id so we know where to route execution later
    tool_routing_map = {}
    
    for s in servers:
        server_dict = dict(s)
        headers = _build_headers(server_dict)
        try:
            response = http_requests.post(
                server_dict["url"],
                json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
                headers=headers,
                stream=True,
                timeout=5,
            )
            response.raise_for_status()
            data = _parse_sse_response(response)
            
            if data and "result" in data and "tools" in data["result"]:
                for tool in data["result"]["tools"]:
                    tool_name = tool.get("name")
                    if not tool_name:
                        continue
                        
                    # Build OpenAI tool schema
                    openai_tool = {
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "description": tool.get("description", "")[:1024],
                            "parameters": tool.get("inputSchema", {"type": "object", "properties": {}})
                        }
                    }
                    all_tools.append(openai_tool)
                    tool_routing_map[tool_name] = server_dict["id"]
                    
        except Exception as e:
            print(f"Failed to fetch tools from MCP server {server_dict['name']}: {e}")
            continue
            
    return all_tools, tool_routing_map


def execute_mcp_tool(db, server_id: int, tool_name: str, arguments: dict):
    """Calls a tool on a specific MCP server and returns the result."""
    server = db.execute("SELECT * FROM mcp_servers WHERE id = ?", (server_id,)).fetchone()
    if not server:
        return "Error: MCP server not found for this tool."
        
    server_dict = dict(server)
    headers = _build_headers(server_dict)
    
    try:
        response = http_requests.post(
            server_dict["url"],
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
                "id": 2,
            },
            headers=headers,
            stream=True,
            timeout=30,
        )
        response.raise_for_status()
        
        data = _parse_sse_response(response)
        if data and "result" in data:
            content = data["result"].get("content", [])
            text_parts = [item["text"] for item in content if item.get("type") == "text"]
            if text_parts:
                return "\n".join(text_parts)
            return "Tool executed successfully but returned no text."
            
        if data and "error" in data:
            return f"Tool execution failed: {data['error'].get('message', 'Unknown error')}"
            
        return "No response from tool."
        
    except Exception as e:
        return f"Error executing tool: {str(e)}"
