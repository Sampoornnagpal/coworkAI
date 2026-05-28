import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    JWT_SECRET = os.getenv("JWT_SECRET", "fallback-secret")
    
    # Encryption key for DB secrets
    _encryption_key = os.getenv("ENCRYPTION_KEY")
    if not _encryption_key:
        from cryptography.fernet import Fernet
        _encryption_key = Fernet.generate_key().decode()
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        with open(env_path, "a") as f:
            f.write(f"\nENCRYPTION_KEY={_encryption_key}\n")
        print(f"Generated new ENCRYPTION_KEY and saved to {env_path}")
    ENCRYPTION_KEY = _encryption_key

    DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/cowork.db")
    CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")
    OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
    MODEL_NAME = os.getenv("MODEL_NAME", "ollama/llama3.1")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    CHUNK_SIZE = 500
    CHUNK_OVERLAP = 50
    TOP_K = 3

settings = Settings()
