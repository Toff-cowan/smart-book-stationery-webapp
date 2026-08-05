import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# Always load backend/.env (not dependent on process working directory)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _cors_origins() -> list[str] | str:
    """Allowed browser origins for the Next.js frontend.

    Merges CORS_ORIGINS (comma-separated) with FRONTEND_URL so both the
    primary site and any extra aliases (e.g. second Vercel project) work.
    Empty / unset → allow all (local dev convenience).
    """
    parts: list[str] = []
    for raw in (
        os.getenv("CORS_ORIGINS") or "",
        os.getenv("FRONTEND_URL") or "",
    ):
        for part in raw.split(","):
            origin = part.strip().rstrip("/")
            if origin and origin not in parts:
                parts.append(origin)
    return parts or "*"


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
