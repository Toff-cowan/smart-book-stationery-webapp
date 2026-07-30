from flask import Blueprint, jsonify, request

from app.models import Product, Category
from app.services.product_search_service import search_products

product_bp = Blueprint("products", __name__)


@product_bp.route("", methods=["GET"])
def list_products():
    query = Product.query.filter_by(is_active=True)

    category_id = request.args.get("category_id", type=int)
    if category_id:
        query = query.filter_by(category_id=category_id)

    page = max(request.args.get("page", 1, type=int) or 1, 1)
    per_page = min(max(request.args.get("per_page", 20, type=int) or 20, 1), 100)
    search = (request.args.get("q") or "").strip()

    result = search_products(query, search, page=page, per_page=per_page)

    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in result["items"]],
        "pagination": {
            "page": result["page"],
            "per_page": result["per_page"],
            "total": result["total"],
            "pages": result["pages"],
        },
    }), 200


@product_bp.route("/<int:product_id>", methods=["GET"])
def get_product(product_id):
    product = Product.query.filter_by(id=product_id, is_active=True).first()
    if not product:
        return jsonify({"success": False, "message": "Product not found"}), 404
    return jsonify({"success": True, "data": product.to_dict()}), 200


@product_bp.route("/categories", methods=["GET"])
def list_categories():
    categories = Category.query.order_by(Category.name.asc()).all()
    return jsonify({
        "success": True,
        "data": [c.to_dict() for c in categories],
    }), 200
