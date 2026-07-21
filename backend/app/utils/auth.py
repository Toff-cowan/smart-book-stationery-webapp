from app.extensions.db import db
from app.models import User


def get_current_user():
    """Resolve the JWT identity to a User row."""
    from flask_jwt_extended import get_jwt_identity

    user_id = get_jwt_identity()
    if user_id is None:
        return None
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)
