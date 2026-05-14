from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token

auth_bp = Blueprint("auth", __name__)


# =====================================
# Temporary In-Memory User Store
# Replace with PostgreSQL later
# =====================================
users = []


# =====================================
# Register User
# =====================================
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json()

    # Validation
    if not data:
        return jsonify({
            "success": False,
            "message": "No input data provided"
        }), 400

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    # Required fields
    if not name or not email or not password:
        return jsonify({
            "success": False,
            "message": "All fields are required"
        }), 400

    # Check existing user
    existing_user = next(
        (user for user in users if user["email"] == email),
        None
    )

    if existing_user:
        return jsonify({
            "success": False,
            "message": "Email already exists"
        }), 409

    # Hash password
    hashed_password = generate_password_hash(password)

    # Create user
    new_user = {
        "id": len(users) + 1,
        "name": name,
        "email": email,
        "password": hashed_password
    }

    users.append(new_user)

    return jsonify({
        "success": True,
        "message": "User registered successfully",
        "data": {
            "id": new_user["id"],
            "name": new_user["name"],
            "email": new_user["email"]
        }
    }), 201


# =====================================
# Login User
# =====================================
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "message": "No input data provided"
        }), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({
            "success": False,
            "message": "Email and password are required"
        }), 400

    # Find user
    user = next(
        (user for user in users if user["email"] == email),
        None
    )

    if not user:
        return jsonify({
            "success": False,
            "message": "Invalid credentials"
        }), 401

    # Check password
    if not check_password_hash(user["password"], password):
        return jsonify({
            "success": False,
            "message": "Invalid credentials"
        }), 401

    # Generate JWT Token
    access_token = create_access_token(identity=user["id"])

    return jsonify({
        "success": True,
        "message": "Login successful",
        "token": access_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200


# =====================================
# Test Protected Route
# =====================================
from flask_jwt_extended import jwt_required, get_jwt_identity


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_current_user():

    current_user_id = get_jwt_identity()

    user = next(
        (user for user in users if user["id"] == current_user_id),
        None
    )

    if not user:
        return jsonify({
            "success": False,
            "message": "User not found"
        }), 404

    return jsonify({
        "success": True,
        "data": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200