import uuid

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename

from app.extensions.db import db
from app.models import User
from app.services.media_storage import delete_stored_url, upload_bytes
from app.schemas import (
    register_schema,
    login_schema,
    profile_update_schema,
    validate_json,
)
from app.utils.auth import get_current_user
from app.utils.roles import is_staff

auth_bp = Blueprint("auth", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@auth_bp.route("/register", methods=["POST"])
def register():
    data, error = validate_json(register_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    email = data["email"].strip().lower()
    name = data["name"].strip()
    password = data["password"]

    if User.query.filter_by(email=email).first():
        return jsonify({
            "success": False,
            "message": "Email already exists",
        }), 409

    user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role="customer",
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        # Concurrent registration with the same email can race past the check above
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": "Email already exists",
        }), 409

    return jsonify({
        "success": True,
        "message": "User registered successfully",
        "data": user.to_dict(),
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data, error = validate_json(login_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    email = data["email"].strip().lower()
    password = data["password"]

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({
            "success": False,
            "message": "Invalid credentials",
        }), 401

    now = datetime.now(timezone.utc)
    user.last_login_at = now
    if is_staff(user.role):
        user.last_admin_login_at = now
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": access_token,
        "user": user.to_dict(),
    }), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = get_current_user()
    if not user:
        return jsonify({
            "success": False,
            "message": "User not found",
        }), 404

    return jsonify({
        "success": True,
        "data": user.to_dict(),
    }), 200


@auth_bp.route("/me", methods=["PATCH"])
@jwt_required()
def update_me():
    user = get_current_user()
    if not user:
        return jsonify({
            "success": False,
            "message": "User not found",
        }), 404

    data, error = validate_json(profile_update_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    if not data:
        return jsonify({
            "success": False,
            "message": "No fields to update",
        }), 400

    if "name" in data:
        user.name = data["name"].strip()

    if "email" in data:
        email = data["email"].strip().lower()
        if email != user.email:
            existing = User.query.filter_by(email=email).first()
            if existing and existing.id != user.id:
                return jsonify({
                    "success": False,
                    "message": "Email already exists",
                }), 409
            user.email = email

    if "phone" in data:
        phone = data["phone"]
        if phone is None or (isinstance(phone, str) and not phone.strip()):
            user.phone = None
        else:
            user.phone = str(phone).strip()

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": "Email already exists",
        }), 409

    return jsonify({
        "success": True,
        "message": "Profile updated",
        "data": user.to_dict(),
    }), 200


@auth_bp.route("/me/avatar", methods=["POST"])
@jwt_required()
def upload_avatar():
    user = get_current_user()
    if not user:
        return jsonify({
            "success": False,
            "message": "User not found",
        }), 404

    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided"}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"success": False, "message": "Empty filename"}), 400

    original = secure_filename(file.filename)
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({
            "success": False,
            "message": (
                "Unsupported image type. Use png, jpg, jpeg, webp, or gif."
            ),
        }), 400

    file.stream.seek(0, 2)
    size = file.stream.tell()
    file.stream.seek(0)
    if size <= 0:
        return jsonify({"success": False, "message": "Empty file"}), 400
    if size > MAX_IMAGE_BYTES:
        return jsonify({
            "success": False,
            "message": "Image is too large (max 5 MB).",
        }), 400

    stored_name = f"{user.id}_{uuid.uuid4().hex}.{ext}"
    raw = file.read()
    old_url = user.avatar_url or ""
    try:
        user.avatar_url = upload_bytes(
            folder="avatars",
            filename=stored_name,
            data=raw,
            content_type=file.mimetype,
        )
    except RuntimeError as exc:
        return jsonify({"success": False, "message": str(exc)}), 502
    db.session.commit()
    delete_stored_url(old_url)

    return jsonify({
        "success": True,
        "message": "Avatar uploaded",
        "data": user.to_dict(),
    }), 200
