from decimal import Decimal

from flask import Blueprint, jsonify, request
from marshmallow import Schema, fields, validate, EXCLUDE

from app.extensions.db import db
from app.models import Booklist, Product
from app.schemas import (
    inventory_create_schema,
    inventory_update_schema,
    validate_json,
)
from app.services.booklist_service import notify_user
from app.utils.decorators import admin_required

admin_bp = Blueprint("admin", __name__)


class OrderStatusSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    status = fields.Str(
        required=True,
        validate=validate.OneOf([
            Booklist.STATUS_SUBMITTED,
            Booklist.STATUS_IN_PROGRESS,
            Booklist.STATUS_READY,
            Booklist.STATUS_CANCELLED,
        ]),
    )


order_status_schema = OrderStatusSchema()


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
    if "image_url" in data:
        product.image_url = data["image_url"]
    if "is_active" in data:
        product.is_active = data["is_active"]
    if "category_id" in data:
        product.category_id = data["category_id"]


@admin_bp.route("/orders", methods=["GET"])
@admin_required
def list_all_orders():
    status = request.args.get("status")
    query = Booklist.query.filter(Booklist.status != Booklist.STATUS_DRAFT)
    if status:
        query = query.filter_by(status=status)
    orders = query.order_by(Booklist.submitted_at.desc().nullslast()).all()
    return jsonify({
        "success": True,
        "data": [o.to_dict() for o in orders],
    }), 200


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

    return jsonify({"success": True, "data": order.to_dict()}), 200


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
        image_url=data.get("image_url"),
        is_active=data.get("is_active", True),
        category_id=data.get("category_id"),
    )
    db.session.add(product)
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
