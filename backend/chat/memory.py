from backend.database import get_db
import json

def get_history(user_id: int, limit: int = 6) -> list[dict]:
    db = get_db()
    rows = db.execute(
        "SELECT question, answer FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit // 2)
    ).fetchall()
    db.close()
    
    history = []
    for row in reversed(rows):
        history.append({"role": "user", "content": row["question"]})
        history.append({"role": "assistant", "content": row["answer"]})
    return history

def save_turn(user_id: int, team_id: int, question: str, answer: str, sources: list, tokens: int, model: str = "ollama/llama3.1"):
    db = get_db()
    db.execute(
        "INSERT INTO chat_history (user_id, team_id, question, answer, sources, tokens_used) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, team_id, question, answer, json.dumps(sources), tokens)
    )
    db.execute(
        "INSERT INTO usage_logs (user_id, team_id, model_name, tokens_used) VALUES (?, ?, ?, ?)",
        (user_id, team_id, model, tokens)
    )
    db.commit()
    db.close()
