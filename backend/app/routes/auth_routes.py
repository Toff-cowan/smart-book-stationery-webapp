from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required
from sqlalchemy.exc import IntegrityError

from app.extensions.db import db
from app.models import User
from app.schemas import register_schema, login_schema, validate_json
from app.utils.auth import get_current_user

auth_bp = Blueprint("auth", __name__)


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
