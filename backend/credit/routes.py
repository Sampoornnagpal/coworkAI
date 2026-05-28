from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.database import get_db

router = APIRouter()

class CreditRequestCreate(BaseModel):
    reason: str = ""

class CreditRequestResponse(BaseModel):
    id: int
    team_id: int
    team_name: str = ""
    requested_by: int
    requester_name: str = ""
    reason: str
    status: str
    granted_tokens: int
    reviewed_by: int | None = None
    reviewed_at: str | None = None
    created_at: str

@router.post("/request")
def request_credit(req: CreditRequestCreate, user: dict = Depends(get_current_user)):
    """Team member requests more credits for their team"""
    team_id = user["team_id"]
    user_id = user["id"]
    
    db = get_db()
    
    # Check if there's already a pending request from this team
    existing = db.execute(
        "SELECT id FROM credit_requests WHERE team_id = ? AND status = 'pending'",
        (team_id,)
    ).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Your team already has a pending credit request")
    
    cursor = db.execute(
        "INSERT INTO credit_requests (team_id, requested_by, reason) VALUES (?, ?, ?)",
        (team_id, user_id, req.reason)
    )
    db.commit()
    request_id = cursor.lastrowid
    db.close()
    
    return {"message": "Credit request submitted", "request_id": request_id}

@router.get("/requests")
def my_team_requests(user: dict = Depends(get_current_user)):
    """Get credit requests for the current user's team"""
    team_id = user["team_id"]
    db = get_db()
    rows = db.execute(
        """SELECT cr.*, u.name as requester_name, t.name as team_name
           FROM credit_requests cr
           JOIN users u ON cr.requested_by = u.id
           JOIN teams t ON cr.team_id = t.id
           WHERE cr.team_id = ?
           ORDER BY cr.created_at DESC""",
        (team_id,)
    ).fetchall()
    db.close()
    return [dict(row) for row in rows]
