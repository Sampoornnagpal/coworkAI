from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.database import get_db
from datetime import datetime

router = APIRouter()

class TeamCreate(BaseModel):
    name: str

class TeamResponse(BaseModel):
    id: int
    name: str
    budget_limit: float
    token_limit: int = 100000
    created_at: str

class TokenLimitUpdate(BaseModel):
    token_limit: int

class CreditReview(BaseModel):
    status: str  # "approved" or "denied"
    granted_tokens: int = 0  # only used if approved

def _get_monthly_usage(db, team_id: int) -> int:
    """Get total tokens used by a team in the current calendar month"""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    row = db.execute(
        "SELECT COALESCE(SUM(tokens_used), 0) as total FROM usage_logs WHERE team_id = ? AND created_at >= ?",
        (team_id, month_start)
    ).fetchone()
    return row["total"]

@router.get("/stats")
def get_stats(user: dict = Depends(get_current_user)):
    db = get_db()
    
    # Total queries
    total_queries = db.execute("SELECT COUNT(*) as cnt FROM chat_history").fetchone()["cnt"]
    
    # Total tokens
    total_tokens = db.execute("SELECT COALESCE(SUM(tokens_used), 0) as total FROM usage_logs").fetchone()["total"]
    
    # Total users
    total_users = db.execute("SELECT COUNT(*) as cnt FROM users").fetchone()["cnt"]
    
    # Total documents
    total_documents = db.execute("SELECT COUNT(*) as cnt FROM documents").fetchone()["cnt"]
    
    # Pending credit requests count
    pending_requests = db.execute("SELECT COUNT(*) as cnt FROM credit_requests WHERE status = 'pending'").fetchone()["cnt"]
    
    # Per-team breakdown with token limits and monthly usage
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    
    team_stats = db.execute("""
        SELECT 
            t.id,
            t.name,
            t.token_limit,
            COUNT(DISTINCT u.id) as member_count,
            COALESCE((SELECT COUNT(*) FROM chat_history ch WHERE ch.team_id = t.id), 0) as query_count,
            COALESCE((SELECT SUM(tokens_used) FROM usage_logs ul WHERE ul.team_id = t.id), 0) as tokens_used,
            COALESCE((SELECT SUM(tokens_used) FROM usage_logs ul WHERE ul.team_id = t.id AND ul.created_at >= ?), 0) as monthly_tokens_used,
            COALESCE((SELECT COUNT(*) FROM documents d WHERE d.team_id = t.id), 0) as doc_count
        FROM teams t
        LEFT JOIN users u ON u.team_id = t.id
        GROUP BY t.id, t.name
    """, (month_start,)).fetchall()
    
    db.close()
    
    return {
        "total_queries": total_queries,
        "total_tokens": total_tokens,
        "total_users": total_users,
        "total_documents": total_documents,
        "pending_requests": pending_requests,
        "teams": [dict(row) for row in team_stats]
    }

@router.get("/teams")
def list_teams():
    db = get_db()
    rows = db.execute("SELECT * FROM teams ORDER BY name").fetchall()
    db.close()
    return [dict(row) for row in rows]

@router.post("/teams", response_model=TeamResponse)
def create_team(team: TeamCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    db = get_db()
    
    # Check if team name already exists
    existing = db.execute("SELECT id FROM teams WHERE name = ?", (team.name,)).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Team name already exists")
    
    cursor = db.execute("INSERT INTO teams (name) VALUES (?)", (team.name,))
    db.commit()
    team_id = cursor.lastrowid
    
    new_team = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
    db.close()
    
    return TeamResponse(
        id=new_team["id"],
        name=new_team["name"],
        budget_limit=new_team["budget_limit"],
        token_limit=new_team["token_limit"] if "token_limit" in new_team.keys() else 100000,
        created_at=str(new_team["created_at"])
    )

@router.put("/teams/{team_id}/limit")
def update_team_limit(team_id: int, body: TokenLimitUpdate, user: dict = Depends(get_current_user)):
    """Admin sets the monthly token limit for a team"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if body.token_limit < 0:
        raise HTTPException(status_code=400, detail="Token limit must be non-negative")
    
    db = get_db()
    team = db.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
    if not team:
        db.close()
        raise HTTPException(status_code=404, detail="Team not found")
    
    db.execute("UPDATE teams SET token_limit = ? WHERE id = ?", (body.token_limit, team_id))
    db.commit()
    db.close()
    
    return {"message": f"Token limit updated to {body.token_limit}", "team_id": team_id, "token_limit": body.token_limit}

@router.get("/credit-requests")
def list_credit_requests(user: dict = Depends(get_current_user)):
    """Admin lists all credit requests"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    db = get_db()
    rows = db.execute("""
        SELECT cr.*, u.name as requester_name, t.name as team_name
        FROM credit_requests cr
        JOIN users u ON cr.requested_by = u.id
        JOIN teams t ON cr.team_id = t.id
        ORDER BY 
            CASE WHEN cr.status = 'pending' THEN 0 ELSE 1 END,
            cr.created_at DESC
    """).fetchall()
    db.close()
    return [dict(row) for row in rows]

@router.put("/credit-requests/{request_id}")
def review_credit_request(request_id: int, body: CreditReview, user: dict = Depends(get_current_user)):
    """Admin approves or denies a credit request"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if body.status not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'denied'")
    
    db = get_db()
    req = db.execute("SELECT * FROM credit_requests WHERE id = ?", (request_id,)).fetchone()
    if not req:
        db.close()
        raise HTTPException(status_code=404, detail="Request not found")
    
    if req["status"] != "pending":
        db.close()
        raise HTTPException(status_code=400, detail="Request already reviewed")
    
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    if body.status == "approved" and body.granted_tokens > 0:
        # Increase the team's token limit
        db.execute(
            "UPDATE teams SET token_limit = token_limit + ? WHERE id = ?",
            (body.granted_tokens, req["team_id"])
        )
    
    db.execute(
        "UPDATE credit_requests SET status = ?, granted_tokens = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
        (body.status, body.granted_tokens if body.status == "approved" else 0, user["id"], now, request_id)
    )
    db.commit()
    db.close()
    
    return {"message": f"Request {body.status}", "request_id": request_id}
