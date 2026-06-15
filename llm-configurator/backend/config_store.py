import json
import os
import logging
from datetime import datetime, timezone
from typing import List, Optional

from schemas import ConfigRequest, ConfigResponse
from db import get_db_connection

logger = logging.getLogger(__name__)

CONFIGS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "configs")
os.makedirs(CONFIGS_DIR, exist_ok=True)

def _get_file_path(full_name: str) -> str:
    return os.path.join(CONFIGS_DIR, f"{full_name}.json")

class ConfigAlreadyExistsError(Exception):
    pass

class ConfigNotFoundError(Exception):
    pass

def create_config(config_req: ConfigRequest) -> ConfigResponse:
    full_name = f"{config_req.usecase_name}_{config_req.config_name}"
    file_path = _get_file_path(full_name)
    
    # Check if exists in DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM llm_configs WHERE full_name = ?", (full_name,))
        if cursor.fetchone():
            raise ConfigAlreadyExistsError(f"Config '{full_name}' already exists.")

    now_iso = datetime.now(timezone.utc).isoformat()
    status = "active"
    
    # Dump JSON
    config_dict = config_req.model_dump()
    config_dict["full_name"] = full_name
    config_dict["created_at"] = now_iso
    config_dict["updated_at"] = now_iso
    config_dict["status"] = status
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(config_dict, f, indent=2)

    # Insert DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO llm_configs (usecase_name, config_name, full_name, file_path, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (config_req.usecase_name, config_req.config_name, full_name, file_path, status, now_iso, now_iso))
        conn.commit()

    return ConfigResponse(
        **config_req.model_dump(),
        full_name=full_name,
        status=status,
        created_at=now_iso,
        updated_at=now_iso
    )

def update_config(full_name: str, config_req: ConfigRequest) -> ConfigResponse:
    expected_full_name = f"{config_req.usecase_name}_{config_req.config_name}"
    if expected_full_name != full_name:
        # Full name change not allowed or requires delete+create
        raise ValueError("Cannot change usecase_name or config_name via update. Delete and recreate.")
        
    file_path = _get_file_path(full_name)
    
    # Check if exists in DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT created_at, status FROM llm_configs WHERE full_name = ?", (full_name,))
        row = cursor.fetchone()
        if not row:
            raise ConfigNotFoundError(f"Config '{full_name}' not found.")
            
        created_at = row["created_at"]
        status = row["status"]

    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Dump JSON
    config_dict = config_req.model_dump()
    config_dict["full_name"] = full_name
    config_dict["created_at"] = created_at
    config_dict["updated_at"] = now_iso
    config_dict["status"] = status
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(config_dict, f, indent=2)

    # Update DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE llm_configs
            SET file_path = ?, status = ?, updated_at = ?
            WHERE full_name = ?
        ''', (file_path, status, now_iso, full_name))
        conn.commit()

    return ConfigResponse(
        **config_req.model_dump(),
        full_name=full_name,
        status=status,
        created_at=created_at,
        updated_at=now_iso
    )

def get_config(full_name: str) -> Optional[ConfigResponse]:
    file_path = _get_file_path(full_name)
    if not os.path.exists(file_path):
        return None
        
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM llm_configs WHERE full_name = ?", (full_name,))
        row = cursor.fetchone()
        
    if not row:
        logger.warning(f"Drift detected: Config file exists at {file_path} but missing from DB for '{full_name}'.")
        return None
        
    status = row["status"]

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    data["status"] = status
    return ConfigResponse(**data)

def list_configs() -> List[dict]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, full_name, status, file_path FROM llm_configs ORDER BY created_at DESC")
        rows = cursor.fetchall()
        
    results = []
    for r in rows:
        operations_present = []
        restrictions = None
        if os.path.exists(r["file_path"]):
            try:
                with open(r["file_path"], "r", encoding="utf-8") as f:
                    data = json.load(f)
                    operations_present = list(data.get("operations", {}).keys())
                    restrictions = data.get("restrictions", {})
            except Exception:
                pass
                
        results.append({
            "id": r["id"],
            "full_name": r["full_name"],
            "status": r["status"],
            "operations_present": operations_present,
            "restrictions": restrictions,
            "endpoint_base_url": f"http://localhost:8001/llm/{r['full_name']}"
        })
    return results

def delete_config(full_name: str) -> bool:
    file_path = _get_file_path(full_name)
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM llm_configs WHERE full_name = ?", (full_name,))
        deleted = cursor.rowcount > 0
        conn.commit()
        
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
        
    return deleted
