from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth.utils import get_current_user
from backend.database import get_db
from backend.models.providers import SUPPORTED_PROVIDERS
from backend.config import settings
import os
import httpx

router = APIRouter()

# A2A agent providers are managed in the Agents section, not Models
A2A_PROVIDER_KEYS = {"langgraph", "pydantic_ai", "bedrock_agent", "vertex_ai_agent", "azure_ai_agent"}


@router.get("/providers")
def list_providers(user: dict = Depends(get_current_user)):
    """List all supported LLM providers with credential status for the user's team."""
    db = get_db()
    team_id = user["team_id"]
    providers = []
    for key, val in SUPPORTED_PROVIDERS.items():
        # Skip A2A agent providers — they are managed in the Agents page
        if key in A2A_PROVIDER_KEYS:
            continue
        # Check if all credentials are saved for this provider/team
        saved_creds = db.execute(
            "SELECT credential_key FROM provider_credentials WHERE provider = ? AND team_id = ?",
            (key, team_id)
        ).fetchall()
        saved_keys = {row["credential_key"] for row in saved_creds}
        all_saved = all(c["key"] in saved_keys for c in val["required_credentials"])

        providers.append({
            "id": key,
            "name": val["name"],
            "model_count": len(val["models"]),
            "required_credentials": val["required_credentials"],
            "is_configured": all_saved,
        })
    db.close()
    return {"providers": providers}


@router.get("/providers/{provider_id}")
def get_provider(provider_id: str, user: dict = Depends(get_current_user)):
    """Get detailed info about a provider, including credential status and model activation."""
    if provider_id not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Provider not found")
    provider = SUPPORTED_PROVIDERS[provider_id]
    team_id = user["team_id"]
    db = get_db()

    saved_creds = db.execute(
        "SELECT credential_key FROM provider_credentials WHERE provider = ? AND team_id = ?",
        (provider_id, team_id)
    ).fetchall()
    saved_keys = {row["credential_key"] for row in saved_creds}

    active_models = db.execute(
        "SELECT litellm_model_string FROM configured_models WHERE provider = ? AND team_id = ? AND is_active = 1",
        (provider_id, team_id)
    ).fetchall()
    active_strings = {row["litellm_model_string"] for row in active_models}
    db.close()

    credentials_status = []
    for cred in provider["required_credentials"]:
        credentials_status.append({**cred, "is_saved": cred["key"] in saved_keys})

    models = []
    for m in provider["models"]:
        models.append({**m, "is_active": m["model_string"] in active_strings})

    return {
        "id": provider_id,
        "provider": provider["name"],
        "credentials": credentials_status,
        "all_credentials_saved": all(c["key"] in saved_keys for c in provider["required_credentials"]),
        "models": models
    }


class SaveCredentials(BaseModel):
    provider: str
    credentials: dict


@router.post("/credentials")
def save_credentials(req: SaveCredentials, user: dict = Depends(get_current_user)):
    """Save API credentials for a provider (scoped to the user's team)."""
    if req.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Provider not found")
    db = get_db()
    team_id = user["team_id"]
    from backend.auth.encryption import encrypt_secret
    for key, value in req.credentials.items():
        if not value or not value.strip():
            continue
        encrypted_val = encrypt_secret(value.strip())
        db.execute(
            """INSERT INTO provider_credentials (provider, credential_key, credential_value, team_id, added_by)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(provider, credential_key, team_id) DO UPDATE SET credential_value = excluded.credential_value""",
            (req.provider, key, encrypted_val, team_id, user["id"])
        )
    db.commit()
    db.close()
    return {"status": "ok", "message": f"Credentials saved for {req.provider}"}


class ActivateModel(BaseModel):
    provider: str
    model_string: str
    display_name: str


@router.post("/activate")
def activate_model(req: ActivateModel, user: dict = Depends(get_current_user)):
    """Activate a cloud model for the user's team."""
    if req.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Provider not found")
    db = get_db()
    team_id = user["team_id"]

    # Verify all required credentials are saved
    provider = SUPPORTED_PROVIDERS[req.provider]
    for cred in provider["required_credentials"]:
        row = db.execute(
            "SELECT id FROM provider_credentials WHERE provider = ? AND credential_key = ? AND team_id = ?",
            (req.provider, cred["key"], team_id)
        ).fetchone()
        if not row:
            db.close()
            raise HTTPException(status_code=400, detail=f"Missing credential: {cred['label']}. Save credentials first.")

    existing = db.execute(
        "SELECT id FROM configured_models WHERE litellm_model_string = ? AND team_id = ?",
        (req.model_string, team_id)
    ).fetchone()

    if existing:
        db.execute("UPDATE configured_models SET is_active = 1 WHERE id = ?", (existing["id"],))
    else:
        db.execute(
            """INSERT INTO configured_models (provider, model_name, display_name, litellm_model_string, added_by, team_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (req.provider, req.display_name, req.display_name, req.model_string, user["id"], team_id)
        )
    db.commit()
    db.close()
    return {"status": "ok", "message": f"{req.display_name} activated"}


@router.post("/deactivate")
def deactivate_model(req: ActivateModel, user: dict = Depends(get_current_user)):
    """Deactivate a cloud model for the user's team."""
    db = get_db()
    db.execute(
        "UPDATE configured_models SET is_active = 0 WHERE litellm_model_string = ? AND team_id = ?",
        (req.model_string, user["team_id"])
    )
    db.commit()
    db.close()
    return {"status": "ok", "message": f"{req.display_name} deactivated"}


def load_team_credentials(provider: str, team_id: int):
    """Load provider credentials into os.environ so litellm can use them at call time."""
    db = get_db()
    creds = db.execute(
        "SELECT credential_key, credential_value FROM provider_credentials WHERE provider = ? AND team_id = ?",
        (provider, team_id)
    ).fetchall()
    db.close()
    from backend.auth.encryption import decrypt_secret
    for c in creds:
        os.environ[c["credential_key"]] = decrypt_secret(c["credential_value"])


@router.get("/active")
def get_active_models(user: dict = Depends(get_current_user)):
    """Get all active models for the user's team (Ollama defaults + activated cloud models)."""
    db = get_db()
    team_id = user["team_id"]
    cloud_models = db.execute(
        f"SELECT display_name, litellm_model_string, provider FROM configured_models WHERE team_id = ? AND is_active = 1 AND provider NOT IN ({','.join(['?']*len(A2A_PROVIDER_KEYS))})",
        (team_id, *list(A2A_PROVIDER_KEYS))
    ).fetchall()
    db.close()

    models = []

    # Always include local Ollama models
    try:
        response = httpx.get(f"{settings.OLLAMA_URL}/api/tags", timeout=5.0)
        ollama_models = response.json().get("models", [])
        for m in ollama_models:
            models.append({
                "name": m["name"],
                "model_string": f"ollama/{m['name']}",
                "provider": "ollama",
            })
    except Exception:
        # Fallback: at least show the configured default
        models.append({"name": "llama3.1", "model_string": settings.MODEL_NAME, "provider": "ollama"})

    # Add activated cloud models
    for m in cloud_models:
        models.append({
            "name": m["display_name"],
            "model_string": m["litellm_model_string"],
            "provider": m["provider"],
        })

    return {"models": models}
