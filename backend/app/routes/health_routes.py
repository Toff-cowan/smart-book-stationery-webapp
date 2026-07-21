from flask import Blueprint, jsonify
from sqlalchemy import text

from app.extensions.db import db

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health():
    db_ok = False
    try:
        db.session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    status_code = 200 if db_ok else 503
    return jsonify(
        {
            "success": db_ok,
            "status": "ok" if db_ok else "degraded",
            "database": "connected" if db_ok else "unavailable",
        }
    ), status_code
