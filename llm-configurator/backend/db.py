import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "configurator.db")

def init_db():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS llm_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usecase_name TEXT NOT NULL,
                config_name TEXT NOT NULL,
                full_name TEXT UNIQUE NOT NULL,
                file_path TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_full_name TEXT NOT NULL,
                agent_id TEXT,
                endpoint TEXT NOT NULL,
                model_used TEXT,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER,
                latency_ms REAL,
                success BOOLEAN NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS global_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                litellm_model TEXT UNIQUE NOT NULL,
                provider TEXT NOT NULL,
                api_key TEXT,
                api_base TEXT,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()

@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def log_usage(config_full_name: str, agent_id: str, endpoint: str, model_used: str, 
              prompt_tokens: int, completion_tokens: int, total_tokens: int, 
              latency_ms: float, success: bool, error: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO usage_logs 
            (config_full_name, agent_id, endpoint, model_used, prompt_tokens, completion_tokens, total_tokens, latency_ms, success, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            config_full_name,
            agent_id,
            endpoint,
            model_used,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            latency_ms,
            success,
            error,
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()

def get_usage_stats(config_full_name: str) -> dict:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Totals
        cursor.execute('''
            SELECT 
                COUNT(*) as calls,
                SUM(total_tokens) as total_tokens,
                SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failure_count
            FROM usage_logs
            WHERE config_full_name = ?
        ''', (config_full_name,))
        totals = dict(cursor.fetchone() or {})
        totals["total_tokens"] = totals.get("total_tokens") or 0
        
        # Endpoints rollup
        cursor.execute('''
            SELECT endpoint, COUNT(*) as calls, SUM(total_tokens) as tokens
            FROM usage_logs
            WHERE config_full_name = ?
            GROUP BY endpoint
        ''', (config_full_name,))
        endpoints = [dict(row) for row in cursor.fetchall()]
        
        # Agents rollup
        cursor.execute('''
            SELECT agent_id, COUNT(*) as calls, SUM(total_tokens) as tokens
            FROM usage_logs
            WHERE config_full_name = ? AND agent_id IS NOT NULL
            GROUP BY agent_id
        ''', (config_full_name,))
        agents = [dict(row) for row in cursor.fetchall()]
        
        # Last 20 logs
        cursor.execute('''
            SELECT * FROM usage_logs
            WHERE config_full_name = ?
            ORDER BY id DESC LIMIT 20
        ''', (config_full_name,))
        logs = [dict(row) for row in cursor.fetchall()]
        
    return {
        "totals": totals,
        "endpoints": endpoints,
        "agents": agents,
        "recent_logs": logs
    }

def get_global_models() -> list[dict]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM global_models')
        return [dict(row) for row in cursor.fetchall()]

def add_global_model(litellm_model: str, provider: str, api_key: str, api_base: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO global_models (litellm_model, provider, api_key, api_base, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(litellm_model) DO UPDATE SET 
                provider=excluded.provider,
                api_key=excluded.api_key, 
                api_base=excluded.api_base
        ''', (
            litellm_model,
            provider,
            api_key,
            api_base,
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()

def delete_global_model(litellm_model: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM global_models WHERE litellm_model = ?', (litellm_model,))
        conn.commit()
