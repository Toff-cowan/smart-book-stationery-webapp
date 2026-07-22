import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required, verify_jwt_in_request
from sqlalchemy import func
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


def _normalize_school(value: str | None) -> str | None:
    if value is None:
        return None
    label = " ".join(str(value).split())
    return label or None


def _school_already_listed(school: str) -> bool:
    """True when catalog products or prior uploads already cover this school."""
    key = school.casefold()
    product_hit = (
        Product.query.filter(
            Product.is_active.is_(True),
            Product.school.isnot(None),
            Product.school != "",
            func.lower(Product.school) == key,
        )
        .limit(1)
        .first()
    )
    if product_hit:
        return True
    upload_hit = (
        BooklistUpload.query.filter(
            BooklistUpload.school.isnot(None),
            BooklistUpload.school != "",
            func.lower(BooklistUpload.school) == key,
        )
        .limit(1)
        .first()
    )
    return upload_hit is not None


def _listed_schools(query: str | None = None):
    """Distinct school names from catalog products and uploaded booklists."""
    q = (query or "").strip()
    product_rows = (
        db.session.query(Product.school, func.count(Product.id))
        .filter(
            Product.is_active.is_(True),
            Product.school.isnot(None),
            Product.school != "",
        )
        .group_by(Product.school)
        .all()
    )
    upload_rows = (
        db.session.query(BooklistUpload.school, func.count(BooklistUpload.id))
        .filter(
            BooklistUpload.school.isnot(None),
            BooklistUpload.school != "",
        )
        .group_by(BooklistUpload.school)
        .all()
    )

    by_key: dict[str, dict] = {}
    for name, count in product_rows:
        if not name:
            continue
        key = name.casefold()
        entry = by_key.setdefault(
            key, {"name": name, "product_count": 0, "upload_count": 0}
        )
        entry["product_count"] += int(count)
    for name, count in upload_rows:
        if not name:
            continue
        key = name.casefold()
        entry = by_key.setdefault(
            key, {"name": name, "product_count": 0, "upload_count": 0}
        )
        entry["upload_count"] += int(count)
        # Prefer existing display casing if products already set it
        if entry["product_count"] == 0:
            entry["name"] = name

    rows = list(by_key.values())
    if q:
        needle = q.casefold()
        rows = [r for r in rows if needle in r["name"].casefold()]
    rows.sort(key=lambda r: r["name"].casefold())
    return [
        {
            "name": r["name"],
            "product_count": r["product_count"],
            "upload_count": r["upload_count"],
            "count": r["product_count"] + r["upload_count"],
        }
        for r in rows
    ]


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


@cart_bp.route("/items/bulk", methods=["POST"])
@jwt_required()
def add_cart_items_bulk():
    """Add multiple products to the draft cart in one request."""
    user = get_current_user()
    payload = request.get_json(silent=True) or {}
    items = payload.get("items") or []
    if not isinstance(items, list) or not items:
        return jsonify({
            "success": False,
            "message": "Provide items: [{ product_id, quantity }]",
        }), 400

    draft = get_or_create_draft_booklist(user.id)
    added = 0
    skipped = []
    for row in items[:100]:
        if not isinstance(row, dict):
            continue
        try:
            product_id = int(row.get("product_id"))
            quantity = int(row.get("quantity") or 1)
        except (TypeError, ValueError):
            skipped.append({"reason": "invalid ids", "row": row})
            continue
        if quantity < 1:
            quantity = 1
        product = Product.query.filter_by(id=product_id, is_active=True).first()
        if not product:
            skipped.append({"product_id": product_id, "reason": "not found"})
            continue
        if product.stock <= 0:
            skipped.append({
                "product_id": product_id,
                "name": product.name,
                "reason": "out of stock",
            })
            continue
        try:
            upsert_cart_item(draft, product, min(quantity, product.stock))
            added += 1
        except ValueError as exc:
            skipped.append({
                "product_id": product_id,
                "name": product.name,
                "reason": str(exc),
            })

    db.session.refresh(draft)
    return jsonify({
        "success": True,
        "message": f"Added {added} item(s) to cart",
        "added": added,
        "skipped": skipped,
        "data": draft.to_dict(),
    }), 200


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
    """Submit cart as a bookstore request (no online payment)."""
    from app.models import Notification
    from app.services.mail_service import notify_bookstore_of_cart_request

    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    data, error = validate_json(submit_order_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    draft = get_or_create_draft_booklist(user.id)
    if not draft.items:
        return jsonify({"success": False, "message": "Cart is empty"}), 400

    draft.status = Booklist.STATUS_SUBMITTED
    draft.fulfillment_type = data.get("fulfillment_type") or Booklist.FULFILLMENT_PICKUP
    draft.notes = data.get("notes")
    draft.contact_email = data["contact_email"].strip().lower()
    draft.contact_phone = " ".join(data["contact_phone"].split())
    if data.get("title"):
        draft.title = data["title"]
    elif not draft.title:
        draft.title = "Cart request"
    draft.submitted_at = datetime.now(timezone.utc)
    draft.recalculate_total()

    emailed = notify_bookstore_of_cart_request(user, draft)

    db.session.add(
        Notification(
            user_id=user.id,
            type="cart_request",
            title=f"Request sent, {user.name}",
            body=(
                f"Hi {user.name}, we received your cart. The bookstore will "
                f"contact you at {draft.contact_email} or {draft.contact_phone} "
                "with available items, the total cost, and when your package "
                "will be ready for pickup. No online payment is required."
            ),
            booklist_id=draft.id,
        )
    )
    db.session.commit()

    # New empty cart for next shop
    get_or_create_draft_booklist(user.id)

    return jsonify({
        "success": True,
        "message": (
            "Request sent to the bookstore. They will reply by email with "
            "availability, total cost, and pickup timing."
        ),
        "emailed": emailed,
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


@booklist_bp.route("/orders/<int:order_id>", methods=["DELETE"])
@jwt_required()
def delete_order(order_id):
    """Customer cancels/deletes their order; admins are notified on the dashboard."""
    from app.services.booklist_service import notify_admins
    from app.services.mail_service import notify_bookstore_of_order_cancellation

    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.user_id == user.id,
        Booklist.status != Booklist.STATUS_DRAFT,
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404

    if order.status == Booklist.STATUS_CANCELLED:
        return jsonify({
            "success": False,
            "message": "This order is already cancelled.",
        }), 400

    if order.status == Booklist.STATUS_COMPLETED:
        return jsonify({
            "success": False,
            "message": "Completed orders cannot be deleted.",
        }), 400

    previous_status = order.status
    order.status = Booklist.STATUS_CANCELLED
    db.session.flush()

    contact = order.contact_email or user.email
    phone = order.contact_phone or "n/a"
    notify_admins(
        title=f"Order #{order.id} deleted by customer",
        body=(
            f"{user.name} cancelled order #{order.id} "
            f"(was {previous_status}). Contact: {contact}, phone: {phone}. "
            f"Listed total ${float(order.grand_total or 0):.2f}."
        ),
        type_="order_cancelled",
        booklist_id=order.id,
    )
    emailed = notify_bookstore_of_order_cancellation(
        user, order, previous_status=previous_status
    )

    return jsonify({
        "success": True,
        "message": "Order deleted. The bookstore has been notified.",
        "emailed": emailed,
        "data": order.to_dict(),
    }), 200


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


@booklist_bp.route("/schools", methods=["GET"])
def list_booklist_schools():
    """Public search of schools that already have a list (catalog or upload)."""
    q = request.args.get("q")
    return jsonify({"success": True, "data": _listed_schools(q)}), 200


@booklist_bp.route("/scan", methods=["POST"])
def scan_booklist_image():
    """Extract book titles from a booklist photo (Gemini Flash, OCR fallback)."""
    if "file" not in request.files and "image" not in request.files:
        return jsonify({"success": False, "message": "No image provided"}), 400

    file = request.files.get("file") or request.files.get("image")
    if not file or not file.filename:
        return jsonify({"success": False, "message": "Empty filename"}), 400

    try:
        from app.services.ocr_service import load_image_bytes_from_upload
        from app.services.gemini_booklist_service import (
            extract_books_with_gemini,
            gemini_configured,
        )

        data, filename = load_image_bytes_from_upload(file)

        if gemini_configured():
            result = extract_books_with_gemini(data, filename=filename)
        else:
            from app.services.ocr_service import extract_titles_from_image

            current_app.logger.warning(
                "GEMINI_API_KEY unset; falling back to EasyOCR for booklist scan"
            )
            result = extract_titles_from_image(data, filename=filename)
            result["engine"] = "easyocr"
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except Exception:
        current_app.logger.exception("Booklist scan failed")
        return jsonify({
            "success": False,
            "message": "Could not read this booklist image. Try another photo.",
        }), 500

    return jsonify({"success": True, "data": result}), 200


@booklist_bp.route("/match", methods=["POST"])
def match_booklist_titles():
    """
    Match OCR/edited titles against the catalog (optional grade filter).
    Returns match results; catalog list is grade-scoped when grade is set.
    """
    payload = request.get_json(silent=True) or {}
    grade = (payload.get("grade") or "").strip() or None
    titles_raw = payload.get("titles") or []
    if not isinstance(titles_raw, list):
        return jsonify({"success": False, "message": "titles must be a list"}), 400

    titles: list = []
    for item in titles_raw:
        if isinstance(item, str):
            text = item.strip()
            if text:
                titles.append(text)
        elif isinstance(item, dict):
            text = str(item.get("text") or item.get("title") or "").strip()
            if not text:
                continue
            author = str(item.get("author") or "").strip() or None
            titles.append({"text": text, "author": author})
        else:
            continue

    if not titles:
        return jsonify({
            "success": False,
            "message": "Add at least one title to match.",
        }), 400

    from app.services.book_match_service import match_titles

    result = match_titles(titles, school=None, grade=grade)
    return jsonify({"success": True, "data": result}), 200


@booklist_bp.route("/upload", methods=["POST"])
def upload_booklist_file():
    """Accept a school booklist file for review. Sign-in is optional."""
    verify_jwt_in_request(optional=True)
    user = get_current_user()

    school = _normalize_school(request.form.get("school"))
    if not school:
        return jsonify({
            "success": False,
            "message": "School name is required.",
        }), 400
    if len(school) > 200:
        return jsonify({
            "success": False,
            "message": "School name is too long.",
        }), 400

    if _school_already_listed(school):
        return jsonify({
            "success": False,
            "message": (
                f'"{school}" already has a booklist. '
                "Search for it above and browse the catalog instead."
            ),
            "school": school,
        }), 409

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

    owner = str(user.id) if user else "guest"
    stored_name = f"{owner}_{uuid.uuid4().hex}.{ext}"
    dest = _upload_dir() / stored_name
    file.save(dest)

    notes = (request.form.get("notes") or "").strip() or None
    upload = BooklistUpload(
        user_id=user.id if user else None,
        school=school,
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
