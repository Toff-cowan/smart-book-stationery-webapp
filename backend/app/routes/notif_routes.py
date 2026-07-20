from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app.extensions.db import db
from app.models import Notification
from app.utils.auth import get_current_user

notif_bp = Blueprint("notifications", __name__)


@notif_bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    user = get_current_user()
    notes = (
        Notification.query.filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify({
        "success": True,
        "data": [n.to_dict() for n in notes],
    }), 200


@notif_bp.route("/<int:notification_id>/read", methods=["POST"])
@jwt_required()
def mark_read(notification_id):
    user = get_current_user()
    note = Notification.query.filter_by(id=notification_id, user_id=user.id).first()
    if not note:
        return jsonify({"success": False, "message": "Notification not found"}), 404
    note.is_read = True
    db.session.commit()
    return jsonify({"success": True, "data": note.to_dict()}), 200


@notif_bp.route("/read-all", methods=["POST"])
@jwt_required()
def mark_all_read():
    user = get_current_user()
    Notification.query.filter_by(user_id=user.id, is_read=False).update(
        {"is_read": True}
    )
    db.session.commit()
    return jsonify({"success": True, "message": "All notifications marked read"}), 200
