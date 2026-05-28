from fastapi import FastAPI, Request
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from openai import AsyncOpenAI
import ast
import operator
import json

import os
os.environ["OPENAI_BASE_URL"] = "http://localhost:11434/v1"
os.environ["OPENAI_API_KEY"] = "ollama"

app = FastAPI()

# Connect to local Ollama using OpenAI compatibility layer
model = OpenAIChatModel('llama3.1')

agent = Agent(
    model,
    system_prompt='You are a logical calculator agent. Read the user problem and use your calculate tool to solve it mathematically. Think step-by-step.',
)

# Safe math evaluator
operators = {
    ast.Add: operator.add, 
    ast.Sub: operator.sub, 
    ast.Mult: operator.mul, 
    ast.Div: operator.truediv, 
    ast.Pow: operator.pow
}

def eval_expr(expr):
    def eval_(node):
        if isinstance(node, ast.Num): 
            return node.n
        elif isinstance(node, ast.Constant): 
            return node.value
        elif isinstance(node, ast.BinOp): 
            return operators[type(node.op)](eval_(node.left), eval_(node.right))
        elif isinstance(node, ast.UnaryOp): 
            return operators[type(node.op)](eval_(node.operand))
        else: 
            raise TypeError(node)
    return eval_(ast.parse(expr, mode='eval').body)

@agent.tool_plain
def calculate(expression: str) -> str:
    """Evaluate a mathematical expression (e.g. '5 - 3', '2 * 3')."""
    try:
        res = eval_expr(expression)
        return str(res)
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"

@app.post("/")
@app.post("/tasks/send")
async def run_agent(request: Request):
    try:
        # Parse standard JSON-RPC request
        data = await request.json()
        request_id = data.get("id", "req-1")
        params = data.get("params", {})
        message = params.get("message", "")
        
        # Run Pydantic AI Agent
        result = await agent.run(message)
        response_text = result.output
        
        # Build strict A2A JSON-RPC response
        return {
            "jsonrpc": "2.0",
            "id": request_id,
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
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": data.get("id", "req-1") if 'data' in locals() else "req-1",
            "error": {
                "code": -32000,
                "message": str(e)
            }
        }

@app.api_route("/{path_name:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def catch_all(request: Request, path_name: str):
    print(f"CATCH ALL HIT! Method: {request.method}, Path: {path_name}")
    try:
        body = await request.body()
        print(f"Body: {body.decode()}")
    except Exception:
        pass
    return {"detail": "Not Found - Catch All"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5002)
