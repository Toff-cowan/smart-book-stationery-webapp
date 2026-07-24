import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# Always load backend/.env (not dependent on process working directory)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _cors_origins() -> list[str] | str:
    """Allowed browser origins for the Next.js frontend.

    Prefer CORS_ORIGINS (comma-separated). Falls back to FRONTEND_URL.
    Empty / unset → allow all (local dev convenience).
    """
    raw = (os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL") or "").strip()
    if not raw:
        return "*"
    origins = [part.strip().rstrip("/") for part in raw.split(",") if part.strip()]
    return origins or "*"


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-key")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    # Persistent uploads on Render: set UPLOAD_ROOT=/var/data/uploads (disk mount).
    UPLOAD_ROOT = (os.getenv("UPLOAD_ROOT") or "").strip() or None

    CORS_ORIGINS = _cors_origins()


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_SECRET_KEY = "test-jwt-secret-key-at-least-32-bytes"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    CORS_ORIGINS = "*"
    UPLOAD_ROOT = None
