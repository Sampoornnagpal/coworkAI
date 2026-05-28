from fastapi import FastAPI
import uvicorn

app = FastAPI()

# This mocks a Pydantic AI / A2A endpoint
@app.post("/tasks/send")
async def handle_task(request: dict):
    user_message = request.get("message", "No message sent")
    
    return {
        "status": "success",
        "response": f"Hello! I am your test agent. You said: '{user_message}'",
        "agent_name": "Mock Testing Agent"
    }

if __name__ == "__main__":
    print("Starting Mock Agent on http://127.0.0.1:9999")
    uvicorn.run(app, host="127.0.0.1", port=9999)