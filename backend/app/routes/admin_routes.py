from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

from flask import Blueprint, jsonify, request
from marshmallow import Schema, fields, validate, EXCLUDE
from sqlalchemy import func
from werkzeug.utils import secure_filename

from app.extensions.db import db
from app.models import Booklist, Product, User
from app.routes.uploads_routes import product_upload_dir
from app.schemas import (
    inventory_create_schema,
    inventory_update_schema,
    validate_json,
)
from app.services.booklist_service import notify_user
from app.services.mail_service import notify_customer_about_order
from app.utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

OUTSTANDING_STATUSES = (
    Booklist.STATUS_SUBMITTED,
    Booklist.STATUS_IN_PROGRESS,
    Booklist.STATUS_READY,
)


class OrderStatusSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Str(
        required=True,
        validate=validate.OneOf([
            Booklist.STATUS_SUBMITTED,
            Booklist.STATUS_IN_PROGRESS,
            Booklist.STATUS_READY,
            Booklist.STATUS_COMPLETED,
            Booklist.STATUS_CANCELLED,
        ]),
    )


class OrderNotifySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    message = fields.Str(required=True, validate=validate.Length(min=1, max=5000))
    confirmed_total = fields.Decimal(load_default=None, as_string=False, places=2)
    ready_at = fields.Str(load_default=None, validate=validate.Length(max=200))


order_status_schema = OrderStatusSchema()
order_notify_schema = OrderNotifySchema()


def _apply_inventory_fields(product, data):
    if "name" in data:
        product.name = data["name"].strip()
    if "price" in data:
        product.price = Decimal(str(data["price"]))
    if "quantity" in data:
        product.stock = data["quantity"]
    if "department" in data:
        product.department = data["department"]
    if "description" in data:
        product.description = data["description"]
    if "author" in data:
        product.author = data["author"]
    if "publisher" in data:
        product.publisher = data["publisher"]
    if "school" in data:
        product.school = data["school"].strip() if data["school"] else None
    if "grades" in data:
        product.set_grades(data["grades"])
    if "image_url" in data:
        product.image_url = data["image_url"]
    if "is_active" in data:
        product.is_active = data["is_active"]
    if "category_id" in data:
        product.category_id = data["category_id"]


def _order_to_admin_dict(order: Booklist):
    data = order.to_dict(include_items=True)
    customer = order.user or db.session.get(User, order.user_id)
    data["customer"] = (
        {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "contact_email": order.contact_email or customer.email,
            "contact_phone": order.contact_phone,
        }
        if customer
        else None
    )
    data["item_count"] = sum(item.quantity for item in order.items)
    return data


@admin_bp.route("/orders", methods=["GET"])
@admin_required
def list_all_orders():
    status = request.args.get("status")
    bucket = (request.args.get("bucket") or "").strip().lower()
    query = Booklist.query.filter(Booklist.status != Booklist.STATUS_DRAFT)
    if status:
        query = query.filter_by(status=status)
    elif bucket == "outstanding":
        query = query.filter(Booklist.status.in_(OUTSTANDING_STATUSES))
    elif bucket == "completed":
        query = query.filter(Booklist.status == Booklist.STATUS_COMPLETED)
    elif bucket == "cancelled":
        query = query.filter(Booklist.status == Booklist.STATUS_CANCELLED)

    orders = query.order_by(Booklist.submitted_at.desc().nullslast()).all()
    return jsonify({
        "success": True,
        "data": [_order_to_admin_dict(o) for o in orders],
    }), 200


@admin_bp.route("/orders/<int:order_id>", methods=["GET"])
@admin_required
def get_order(order_id):
    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.status != Booklist.STATUS_DRAFT,
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
    return jsonify({"success": True, "data": _order_to_admin_dict(order)}), 200


@admin_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
@admin_required
def update_order_status(order_id):
    data, error = validate_json(order_status_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.status != Booklist.STATUS_DRAFT,
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404

    previous = order.status
    order.status = data["status"]
    db.session.commit()

    if order.status == Booklist.STATUS_READY and previous != Booklist.STATUS_READY:
        notify_user(
            user_id=order.user_id,
            title="Your order is ready",
            body=f"Order #{order.id} is ready for pickup.",
            type_="order_ready",
            booklist_id=order.id,
        )

    return jsonify({"success": True, "data": _order_to_admin_dict(order)}), 200


@admin_bp.route("/orders/<int:order_id>/notify", methods=["POST"])
@admin_required
def notify_order_customer(order_id):
    data, error = validate_json(order_notify_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.status != Booklist.STATUS_DRAFT,
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404

    customer = order.user or db.session.get(User, order.user_id)
    if not customer:
        return jsonify({"success": False, "message": "Customer not found"}), 404

    confirmed = data.get("confirmed_total")
    confirmed_float = float(confirmed) if confirmed is not None else None
    ready_at = (data.get("ready_at") or "").strip() or None
    message = data["message"].strip()

    emailed = notify_customer_about_order(
        customer,
        order,
        message=message,
        confirmed_total=confirmed_float,
        ready_at=ready_at,
    )

    notify_body = message
    if confirmed_float is not None:
        notify_body += f"\nConfirmed total: ${confirmed_float:.2f}"
    if ready_at:
        notify_body += f"\nReady for pickup: {ready_at}"

    notify_user(
        user_id=customer.id,
        title=f"Update on order #{order.id}",
        body=notify_body,
        type_="order_update",
        booklist_id=order.id,
    )

    return jsonify({
        "success": True,
        "message": (
            "Customer notified by email."
            if emailed
            else "Customer notified in-app (email logged; configure MAIL_SERVER to send)."
        ),
        "emailed": emailed,
        "data": _order_to_admin_dict(order),
    }), 200


@admin_bp.route("/stats/summary", methods=["GET"])
@admin_required
def stats_summary():
    outstanding = (
        Booklist.query.filter(Booklist.status.in_(OUTSTANDING_STATUSES)).count()
    )
    completed = (
        Booklist.query.filter(Booklist.status == Booklist.STATUS_COMPLETED).count()
    )
    cancelled = (
        Booklist.query.filter(Booklist.status == Booklist.STATUS_CANCELLED).count()
    )
    revenue = (
        db.session.query(func.coalesce(func.sum(Booklist.grand_total), 0))
        .filter(Booklist.status.in_(Booklist.COMPLETED_STATUSES))
        .scalar()
    )
    return jsonify({
        "success": True,
        "data": {
            "outstanding": outstanding,
            "completed": completed,
            "cancelled": cancelled,
            "revenue": float(revenue or 0),
        },
    }), 200


@admin_bp.route("/stats/sales", methods=["GET"])
@admin_required
def stats_sales():
    days = min(max(request.args.get("days", 30, type=int) or 30, 7), 90)
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    start_day = start.replace(hour=0, minute=0, second=0, microsecond=0)

    rows = (
        db.session.query(
            func.date(Booklist.submitted_at).label("day"),
            func.count(Booklist.id),
            func.coalesce(func.sum(Booklist.grand_total), 0),
        )
        .filter(
            Booklist.status.in_(Booklist.COMPLETED_STATUSES),
            Booklist.submitted_at.isnot(None),
            Booklist.submitted_at >= start_day,
        )
        .group_by(func.date(Booklist.submitted_at))
        .order_by(func.date(Booklist.submitted_at).asc())
        .all()
    )

    by_day = {}
    for day, count, revenue in rows:
        key = day.isoformat() if hasattr(day, "isoformat") else str(day)
        by_day[key] = {
            "date": key,
            "order_count": int(count),
            "revenue": float(revenue or 0),
        }

    series = []
    for offset in range(days):
        day = (start_day + timedelta(days=offset)).date().isoformat()
        series.append(
            by_day.get(
                day,
                {"date": day, "order_count": 0, "revenue": 0.0},
            )
        )

    return jsonify({"success": True, "data": series}), 200


@admin_bp.route("/inventory", methods=["GET"])
@admin_required
def list_admin_inventory():
    """List all inventory items including inactive."""
    query = Product.query
    department = (request.args.get("department") or "").strip().lower()
    if department:
        if department not in Product.DEPARTMENTS:
            return jsonify({
                "success": False,
                "message": f"Invalid department. Use one of: {', '.join(Product.DEPARTMENTS)}",
            }), 400
        query = query.filter_by(department=department)

    items = query.order_by(Product.name.asc()).all()
    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in items],
    }), 200


@admin_bp.route("/inventory", methods=["POST"])
@admin_required
def create_inventory_item():
    data, error = validate_json(inventory_create_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    product = Product(
        name=data["name"].strip(),
        price=Decimal(str(data["price"])),
        stock=data["quantity"],
        department=data["department"],
        description=data.get("description"),
        author=data.get("author"),
        publisher=data.get("publisher"),
        school=(data.get("school") or "").strip() or None,
        image_url=data.get("image_url"),
        is_active=data.get("is_active", True),
        category_id=data.get("category_id"),
    )
    db.session.add(product)
    db.session.flush()
    product.set_grades(data.get("grades") or [])
    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Inventory item created",
        "data": product.to_dict(),
    }), 201


@admin_bp.route("/inventory/<int:item_id>", methods=["PATCH"])
@admin_required
def update_inventory_item(item_id):
    data, error = validate_json(inventory_update_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    if not data:
        return jsonify({"success": False, "message": "No fields to update"}), 400

    product = db.session.get(Product, item_id)
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    _apply_inventory_fields(product, data)
    db.session.commit()
    return jsonify({"success": True, "data": product.to_dict()}), 200


@admin_bp.route("/inventory/<int:item_id>/image", methods=["POST"])
@admin_required
def upload_inventory_image(item_id):
    """Accept a multipart image file and attach it to the product."""
    product = db.session.get(Product, item_id)
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

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

    stored_name = f"{product.id}_{uuid.uuid4().hex}.{ext}"
    dest = product_upload_dir() / stored_name
    file.save(dest)

    # Relative path — frontend resolves with API base URL
    product.image_url = f"/api/uploads/products/{stored_name}"
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Image uploaded",
        "data": product.to_dict(),
    }), 200


@admin_bp.route("/inventory/<int:item_id>", methods=["DELETE"])
@admin_required
def delete_inventory_item(item_id):
    """Soft-delete: mark inactive so cart history stays valid."""
    product = db.session.get(Product, item_id)
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    product.is_active = False
    db.session.commit()
    return jsonify({
        "success": True,
        "message": "Inventory item deactivated",
        "data": product.to_dict(),
    }), 200
