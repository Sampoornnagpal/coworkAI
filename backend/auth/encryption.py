from cryptography.fernet import Fernet
from backend.config import settings

# Initialize Fernet suite globally for performance
fernet = Fernet(settings.ENCRYPTION_KEY.encode('utf-8'))

def encrypt_secret(plain_text: str) -> str:
    """Encrypts a plain text secret."""
    if not plain_text:
        return plain_text
    return fernet.encrypt(plain_text.encode('utf-8')).decode('utf-8')

def decrypt_secret(encrypted_text: str) -> str:
    """Decrypts an encrypted secret. If it fails, assumes it's plain text (for backward compatibility)."""
    if not encrypted_text:
        return encrypted_text
    try:
        return fernet.decrypt(encrypted_text.encode('utf-8')).decode('utf-8')
    except Exception:
        # If decryption fails (e.g. InvalidToken), assume the text is not encrypted
        return encrypted_text
