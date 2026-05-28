from fastapi import FastAPI, Request
import json

app = FastAPI()

@app.post("/")
@app.post("/tasks/send")
async def tasks_send(request: Request):
    """
    Standard A2A JSON-RPC endpoint.
    This acts as a mock for a custom agent (simulating a LangGraph flow).
    """
    data = await request.json()
    message = "Unknown message"
    
    # Extract message from A2A JSON-RPC schema
    if "params" in data and "message" in data["params"]:
        parts = data["params"]["message"].get("parts", [])
        for part in parts:
            if part.get("kind") == "text":
                message = part["text"]

    response_text = f"🤖 [Mock LangGraph Node] I received your message: '{message}'.\n\nI am currently a mock agent, but I have successfully parsed your A2A JSON-RPC request!"

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5003)
