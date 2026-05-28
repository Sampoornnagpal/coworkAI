from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.database import get_db
import requests as http_requests
import json
from backend.mcp_client.utils import _build_headers, _parse_sse_response

router = APIRouter()


class AddMCPServer(BaseModel):
    name: str
    url: str
    transport_type: str = "http"
    auth_type: str | None = None
    auth_value: str | None = None


@router.post("/servers")
def add_mcp_server(req: AddMCPServer, user: dict = Depends(get_current_user)):
    """Add a new MCP server connection (admin only)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()
    from backend.auth.encryption import encrypt_secret
    encrypted_auth = encrypt_secret(req.auth_value) if req.auth_value else None
    db.execute(
        "INSERT INTO mcp_servers (name, url, transport_type, auth_type, auth_value, added_by) VALUES (?, ?, ?, ?, ?, ?)",
        (req.name, req.url, req.transport_type, req.auth_type, encrypted_auth, user["id"])
    )
    db.commit()
    db.close()
    return {"status": "ok", "message": f"MCP server '{req.name}' added"}


@router.get("/servers")
def list_mcp_servers(user: dict = Depends(get_current_user)):
    """List all connected MCP servers."""
    db = get_db()
    servers = db.execute("SELECT id, name, url, transport_type, is_active, created_at FROM mcp_servers").fetchall()
    db.close()
    return {"servers": [dict(s) for s in servers]}





@router.get("/servers/{server_id}/tools")
def list_mcp_tools(server_id: int, user: dict = Depends(get_current_user)):
    """Discover tools exposed by an MCP server."""
    db = get_db()
    server = db.execute("SELECT * FROM mcp_servers WHERE id = ?", (server_id,)).fetchone()
    db.close()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    headers = _build_headers(server)

    try:
        response = http_requests.post(
            server["url"],
            json={"jsonrpc": "2.0", "method": "tools/list", "id": 1},
            headers=headers,
            stream=True,
            timeout=15,
        )
        response.raise_for_status()

        data = _parse_sse_response(response)
        tools = []
        if data and "result" in data and "tools" in data["result"]:
            for tool in data["result"]["tools"]:
                tools.append({
                    "name": tool.get("name", ""),
                    "description": (tool.get("description", "") or "")[:200],
                    "parameters": tool.get("inputSchema", {}),
                })

        return {"server": server["name"], "tools": tools}

    except http_requests.ConnectionError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to MCP server at {server['url']}")
    except http_requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"MCP server returned error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


class CallTool(BaseModel):
    server_id: int
    tool_name: str
    arguments: dict


@router.post("/tools/call")
def call_mcp_tool(req: CallTool, user: dict = Depends(get_current_user)):
    """Call a tool on an MCP server."""
    db = get_db()
    server = db.execute("SELECT * FROM mcp_servers WHERE id = ?", (req.server_id,)).fetchone()
    db.close()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    headers = _build_headers(server)

    try:
        response = http_requests.post(
            server["url"],
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {"name": req.tool_name, "arguments": req.arguments},
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
            return {"result": "\n".join(text_parts) if text_parts else "Tool returned no text"}
        if data and "error" in data:
            return {"error": data["error"].get("message", "Tool call failed")}

        return {"result": "No response from tool"}

    except http_requests.ConnectionError:
        raise HTTPException(status_code=502, detail="Cannot connect to MCP server")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/servers/{server_id}")
def delete_mcp_server(server_id: int, user: dict = Depends(get_current_user)):
    """Delete an MCP server connection (admin only)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()
    db.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))
    db.commit()
    db.close()
    return {"status": "ok"}
