from fastapi import FastAPI, Request
import json
import uuid
import uvicorn

app = FastAPI(title="Mock A2A Agent")

@app.post("/a2a")
async def a2a_endpoint(request: Request):
    data = await request.json()
    
    # Check if this is an A2A JSON-RPC request
    if data.get("jsonrpc") == "2.0" and data.get("method") == "tasks/send":
        params = data.get("params", {})
        message_content = ""
        
        # Extract the user's message
        if "message" in params:
            for part in params["message"].get("parts", []):
                if part.get("kind") == "text":
                    message_content += part.get("text", "")
                    
        print(f"Received message: {message_content}")
        
        # Generate a mock response
        response_text = f"Hello! I am your Mock Agent. I received your message: '{message_content}'"
        
        # Build A2A JSON-RPC response
        return {
            "jsonrpc": "2.0",
            "id": data.get("id"),
            "result": {
                "artifacts": [
                    {
                        "parts": [
                            {"kind": "text", "text": response_text}
                        ]
                    }
                ]
            }
        }
    
    # Return error if not a valid A2A request
    return {
        "jsonrpc": "2.0",
        "id": data.get("id"),
        "error": {
            "code": -32600,
            "message": "Invalid Request: Expected tasks/send"
        }
    }

if __name__ == "__main__":
    print("Starting Mock A2A Agent on http://localhost:5001")
    uvicorn.run(app, host="0.0.0.0", port=5001)
