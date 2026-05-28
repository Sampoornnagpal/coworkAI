import sqlite3
import os
from backend.config import settings

def get_db():
    os.makedirs(os.path.dirname(settings.DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            budget_limit REAL DEFAULT 100.0,
            token_limit INTEGER DEFAULT 100000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            team_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            team_id INTEGER NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            uploaded_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id),
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            sources TEXT,
            tokens_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            model_name TEXT NOT NULL,
            tokens_used INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );
        CREATE TABLE IF NOT EXISTS credit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            requested_by INTEGER NOT NULL,
            reason TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            granted_tokens INTEGER DEFAULT 0,
            reviewed_by INTEGER,
            reviewed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id),
            FOREIGN KEY (requested_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS configured_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            model_name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            litellm_model_string TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            added_by INTEGER NOT NULL,
            team_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by) REFERENCES users(id),
            UNIQUE(litellm_model_string, team_id)
        );
        CREATE TABLE IF NOT EXISTS provider_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            credential_key TEXT NOT NULL,
            credential_value TEXT NOT NULL,
            team_id INTEGER,
            added_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by) REFERENCES users(id),
            UNIQUE(provider, credential_key, team_id)
        );
        CREATE TABLE IF NOT EXISTS mcp_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            transport_type TEXT DEFAULT 'http',
            auth_type TEXT,
            auth_value TEXT,
            is_active INTEGER DEFAULT 1,
            added_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS registered_agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT UNIQUE NOT NULL,
            agent_url TEXT NOT NULL,
            agent_description TEXT,
            agent_provider TEXT DEFAULT 'custom',
            is_active INTEGER DEFAULT 1,
            added_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by) REFERENCES users(id)
        );
    """)
    # Migrate existing tables: add token_limit column if missing
    try:
        db.execute("ALTER TABLE teams ADD COLUMN token_limit INTEGER DEFAULT 100000")
    except Exception:
        pass  # column already exists
    db.close()
    
    migrate_encrypt_existing_keys()

def migrate_encrypt_existing_keys():
    """Migrates existing plain-text API keys and MCP tokens to encrypted format."""
    db = get_db()
    try:
        from backend.auth.encryption import fernet, encrypt_secret
        from cryptography.fernet import InvalidToken
    except ImportError:
        db.close()
        return

    # Migrate provider_credentials
    creds = db.execute("SELECT id, credential_value FROM provider_credentials").fetchall()
    for c in creds:
        val = c["credential_value"]
        if not val:
            continue
        try:
            fernet.decrypt(val.encode('utf-8'))
        except Exception: # Covers InvalidToken
            encrypted_val = encrypt_secret(val)
            db.execute("UPDATE provider_credentials SET credential_value = ? WHERE id = ?", (encrypted_val, c["id"]))

    # Migrate mcp_servers
    servers = db.execute("SELECT id, auth_value FROM mcp_servers WHERE auth_value IS NOT NULL").fetchall()
    for s in servers:
        val = s["auth_value"]
        if not val:
            continue
        try:
            fernet.decrypt(val.encode('utf-8'))
        except Exception:
            encrypted_val = encrypt_secret(val)
            db.execute("UPDATE mcp_servers SET auth_value = ? WHERE id = ?", (encrypted_val, s["id"]))
            
    db.commit()
    db.close()
