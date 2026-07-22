from functools import wraps

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request

from app.utils.auth import get_current_user
from app.utils.roles import is_owner, is_staff


def admin_required(fn):
    """Allow any staff member (owner or employee)."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "User not found"}), 404
        if not is_staff(user.role):
            return jsonify({"success": False, "message": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


def owner_required(fn):
    """Allow only the store owner (full access including revenue/users)."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = get_current_user()
        if not user:
            return jsonify({"success": False, "message": "User not found"}), 404
        if not is_owner(user.role):
            return jsonify({
                "success": False,
                "message": "Owner access required",
            }), 403
        return fn(*args, **kwargs)

    return wrapper
