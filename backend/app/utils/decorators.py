from functools import wraps

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request

from app.utils.auth import get_current_user


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "User not found"}), 404
        if user.role != "admin":
            return jsonify({"success": False, "message": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper
