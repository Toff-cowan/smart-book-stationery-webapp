from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions.db import db
from app.models import Message
from app.schemas import message_create_schema, validate_json
from app.utils.auth import get_current_user
from app.utils.decorators import admin_required

message_bp = Blueprint("messages", __name__)


@message_bp.route("", methods=["GET"])
@jwt_required()
def list_messages():
    user = get_current_user()
    if user.role == "admin":
        target_user_id = request.args.get("user_id", type=int)
        if not target_user_id:
            return jsonify({
                "success": False,
                "message": "Admin must provide user_id query param",
            }), 400
    else:
        target_user_id = user.id

    messages = (
        Message.query.filter_by(user_id=target_user_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [m.to_dict() for m in messages],
    }), 200


@message_bp.route("", methods=["POST"])
@jwt_required()
def send_message():
    user = get_current_user()
    data, error = validate_json(message_create_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    msg = Message(
        user_id=user.id,
        sender_role="customer",
        body=data["body"].strip(),
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Message sent to bookstore",
        "data": msg.to_dict(),
    }), 201


@message_bp.route("/reply/<int:customer_user_id>", methods=["POST"])
@admin_required
def admin_reply(customer_user_id):
    data, error = validate_json(message_create_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    msg = Message(
        user_id=customer_user_id,
        sender_role="admin",
        body=data["body"].strip(),
    )
    db.session.add(msg)
    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Reply sent",
        "data": msg.to_dict(),
    }), 201
