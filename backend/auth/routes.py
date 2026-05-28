from fastapi import APIRouter, Depends, HTTPException, status
from backend.auth.models import UserCreate, UserLogin, UserResponse, TokenResponse
from backend.auth.utils import hash_password, verify_password, create_token, get_current_user
from backend.database import get_db

router = APIRouter()

@router.post("/signup", response_model=TokenResponse)
def signup(user: UserCreate):
    db = get_db()
    
    existing = db.execute("SELECT id FROM users WHERE email = ?", (user.email,)).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    
    team = db.execute("SELECT id, name FROM teams WHERE id = ?", (user.team_id,)).fetchone()
    if not team:
        db.close()
        raise HTTPException(status_code=400, detail="Team not found")
    
    hashed = hash_password(user.password)
    cursor = db.execute(
        "INSERT INTO users (email, password_hash, name, team_id, role) VALUES (?, ?, ?, ?, ?)",
        (user.email, hashed, user.name, user.team_id, "member")
    )
    db.commit()
    user_id = cursor.lastrowid
    db.close()
    
    token = create_token({"user_id": user_id})
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user_id, email=user.email, name=user.name, team_id=user.team_id, role="member", team_name=team["name"])
    )

@router.post("/login", response_model=TokenResponse)
def login(creds: UserLogin):
    db = get_db()
    user = db.execute(
        "SELECT u.*, t.name as team_name FROM users u JOIN teams t ON u.team_id = t.id WHERE u.email = ?",
        (creds.email,)
    ).fetchone()
    db.close()
    
    if not user or not verify_password(creds.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token({"user_id": user["id"]})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"], email=user["email"], name=user["name"],
            team_id=user["team_id"], role=user["role"], team_name=user["team_name"]
        )
    )

@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        team_id=user["team_id"], role=user["role"], team_name=user.get("team_name", "")
    )
