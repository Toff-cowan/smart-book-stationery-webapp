import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename

from app.extensions.db import db
from app.models import Booklist, BooklistItem, BooklistUpload, Product
from app.schemas import (
    cart_item_schema,
    cart_item_update_schema,
    submit_order_schema,
    validate_json,
)
from app.services.booklist_service import get_or_create_draft_booklist, upsert_cart_item
from app.utils.auth import get_current_user

cart_bp = Blueprint("cart", __name__)
booklist_bp = Blueprint("booklists", __name__)

ALLOWED_UPLOAD_EXTENSIONS = {
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "doc",
    "docx",
    "txt",
    "csv",
}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def _upload_dir() -> Path:
    root = Path(current_app.root_path).parent / "uploads" / "booklists"
    root.mkdir(parents=True, exist_ok=True)
    return root


# ---------- Cart (draft booklist) ----------


@cart_bp.route("", methods=["GET"])
@jwt_required()
def get_cart():
    user = get_current_user()
    draft = get_or_create_draft_booklist(user.id)
    return jsonify({"success": True, "data": draft.to_dict()}), 200


@cart_bp.route("/items", methods=["POST"])
@jwt_required()
def add_cart_item():
    user = get_current_user()
    data, error = validate_json(cart_item_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    product = Product.query.filter_by(id=data["product_id"], is_active=True).first()
    if not product:
        return jsonify({"success": False, "message": "Product not found"}), 404

    draft = get_or_create_draft_booklist(user.id)
    try:
        upsert_cart_item(draft, product, data["quantity"])
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    db.session.refresh(draft)
    return jsonify({"success": True, "data": draft.to_dict()}), 200


@cart_bp.route("/items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def update_cart_item(item_id):
    user = get_current_user()
    data, error = validate_json(cart_item_update_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    draft = get_or_create_draft_booklist(user.id)
    item = BooklistItem.query.filter_by(id=item_id, booklist_id=draft.id).first()
    if not item:
        return jsonify({"success": False, "message": "Cart item not found"}), 404

    product = db.session.get(Product, item.product_id)
    if not product or not product.is_active:
        return jsonify({"success": False, "message": "Product not available"}), 404

    upsert_cart_item(draft, product, data["quantity"])
    db.session.refresh(draft)
    return jsonify({"success": True, "data": draft.to_dict()}), 200


@cart_bp.route("/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def remove_cart_item(item_id):
    user = get_current_user()
    draft = get_or_create_draft_booklist(user.id)
    item = BooklistItem.query.filter_by(id=item_id, booklist_id=draft.id).first()
    if not item:
        return jsonify({"success": False, "message": "Cart item not found"}), 404

    db.session.delete(item)
    db.session.flush()
    draft.recalculate_total()
    db.session.commit()
    return jsonify({"success": True, "data": draft.to_dict()}), 200


@cart_bp.route("/checkout", methods=["POST"])
@jwt_required()
def checkout():
    """Place order: reserve or order for pickup."""
    user = get_current_user()
    data, error = validate_json(submit_order_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    draft = get_or_create_draft_booklist(user.id)
    if not draft.items:
        return jsonify({"success": False, "message": "Cart is empty"}), 400

    draft.status = Booklist.STATUS_SUBMITTED
    draft.fulfillment_type = data["fulfillment_type"]
    draft.notes = data.get("notes")
    if data.get("title"):
        draft.title = data["title"]
    elif not draft.title:
        draft.title = "Bookstore order"
    draft.submitted_at = datetime.now(timezone.utc)
    draft.recalculate_total()
    db.session.commit()

    # New empty cart for next shop
    get_or_create_draft_booklist(user.id)

    return jsonify({
        "success": True,
        "message": "Order placed successfully",
        "data": draft.to_dict(),
    }), 201


# ---------- Orders / booklists (submitted) ----------


@booklist_bp.route("/orders", methods=["GET"])
@jwt_required()
def list_orders():
    user = get_current_user()
    orders = (
        Booklist.query.filter(
            Booklist.user_id == user.id,
            Booklist.status != Booklist.STATUS_DRAFT,
        )
        .order_by(Booklist.submitted_at.desc().nullslast(), Booklist.id.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [o.to_dict() for o in orders],
    }), 200


@booklist_bp.route("/orders/<int:order_id>", methods=["GET"])
@jwt_required()
def get_order(order_id):
    user = get_current_user()
    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.user_id == user.id,
        Booklist.status != Booklist.STATUS_DRAFT,
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
    return jsonify({"success": True, "data": order.to_dict()}), 200


@booklist_bp.route("/saved", methods=["GET"])
@jwt_required()
def list_saved_lists():
    """Named lists including drafts and shared lists owned by the user."""
    user = get_current_user()
    lists = (
        Booklist.query.filter_by(user_id=user.id)
        .order_by(Booklist.updated_at.desc())
        .all()
    )
    return jsonify({"success": True, "data": [b.to_dict() for b in lists]}), 200


@booklist_bp.route("/<int:booklist_id>/share", methods=["POST"])
@jwt_required()
def share_booklist(booklist_id):
    user = get_current_user()
    booklist = Booklist.query.filter_by(id=booklist_id, user_id=user.id).first()
    if not booklist:
        return jsonify({"success": False, "message": "Booklist not found"}), 404

    if not booklist.share_token:
        booklist.share_token = secrets.token_urlsafe(24)
        db.session.commit()

    return jsonify({
        "success": True,
        "data": {
            "share_token": booklist.share_token,
            "share_path": f"/api/booklists/shared/{booklist.share_token}",
            "booklist": booklist.to_dict(),
        },
    }), 200


@booklist_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_booklist_file():
    """Accept a customer booklist file (PDF/image/doc) for bookstore review."""
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided"}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"success": False, "message": "Empty filename"}), 400

    original = secure_filename(file.filename)
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        return jsonify({
            "success": False,
            "message": (
                "Unsupported file type. Use PDF, image, Word, TXT, or CSV."
            ),
        }), 400

    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size <= 0:
        return jsonify({"success": False, "message": "File is empty"}), 400
    if size > MAX_UPLOAD_BYTES:
        return jsonify({
            "success": False,
            "message": "File too large (max 8 MB)",
        }), 400

    stored_name = f"{user.id}_{uuid.uuid4().hex}.{ext}"
    dest = _upload_dir() / stored_name
    file.save(dest)

    notes = (request.form.get("notes") or "").strip() or None
    upload = BooklistUpload(
        user_id=user.id,
        original_name=original,
        stored_name=stored_name,
        content_type=file.mimetype,
        size_bytes=size,
        notes=notes,
    )
    db.session.add(upload)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Booklist uploaded — the bookstore will review it.",
        "data": upload.to_dict(),
    }), 201


@booklist_bp.route("/uploads", methods=["GET"])
@jwt_required()
def list_booklist_uploads():
    user = get_current_user()
    uploads = (
        BooklistUpload.query.filter_by(user_id=user.id)
        .order_by(BooklistUpload.created_at.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [u.to_dict() for u in uploads],
    }), 200


@booklist_bp.route("/shared/<string:token>", methods=["GET"])
def get_shared_booklist(token):
    booklist = Booklist.query.filter_by(share_token=token).first()
    if not booklist:
        return jsonify({"success": False, "message": "Shared list not found"}), 404
    return jsonify({"success": True, "data": booklist.to_dict()}), 200
