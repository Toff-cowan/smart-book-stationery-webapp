from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.extensions.db import db
from app.models import Booklist, BooklistItem, Product, ProductGrade, ProductRating
from app.models.product import grade_sort_key
from app.schemas import product_rating_schema, validate_json
from app.utils.auth import get_current_user

inventory_bp = Blueprint("inventory", __name__)


@inventory_bp.route("", methods=["GET"])
def list_inventory():
    """Public catalog browse with inventory field names."""
    query = Product.query.filter_by(is_active=True)

    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(like))
            | (Product.description.ilike(like))
            | (Product.author.ilike(like))
            | (Product.isbn.ilike(like))
            | (Product.publisher.ilike(like))
        )

    department = (request.args.get("department") or "").strip().lower()
    if department:
        if department not in Product.DEPARTMENTS:
            return jsonify({
                "success": False,
                "message": f"Invalid department. Use one of: {', '.join(Product.DEPARTMENTS)}",
            }), 400
        query = query.filter_by(department=department)

    school = (request.args.get("school") or "").strip()
    if school:
        query = query.filter(Product.school.ilike(school))

    grade = (request.args.get("grade") or "").strip()
    if grade:
        query = (
            query.join(Product.grade_tags)
            .filter(func.lower(ProductGrade.grade) == grade.lower())
            .distinct()
        )

    page = max(request.args.get("page", 1, type=int) or 1, 1)
    per_page = min(max(request.args.get("per_page", 20, type=int) or 20, 1), 100)

    pagination = query.order_by(Product.name.asc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in pagination.items],
        "pagination": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
        },
    }), 200


@inventory_bp.route("/bestsellers", methods=["GET"])
def list_bestsellers():
    """Rank active products by units sold on completed booklist orders."""
    limit = min(max(request.args.get("limit", 8, type=int) or 8, 1), 24)

    sold = (
        db.session.query(
            BooklistItem.product_id.label("product_id"),
            func.coalesce(func.sum(BooklistItem.quantity), 0).label("units_sold"),
            func.count(func.distinct(BooklistItem.booklist_id)).label("order_count"),
        )
        .join(Booklist, BooklistItem.booklist_id == Booklist.id)
        .filter(Booklist.status.in_(Booklist.COMPLETED_STATUSES))
        .group_by(BooklistItem.product_id)
        .subquery()
    )

    rows = (
        db.session.query(Product, sold.c.units_sold, sold.c.order_count)
        .join(sold, Product.id == sold.c.product_id)
        .filter(Product.is_active.is_(True))
        .order_by(sold.c.units_sold.desc(), sold.c.order_count.desc(), Product.name.asc())
        .limit(limit)
        .all()
    )

    data = []
    for product, units_sold, order_count in rows:
        item = product.to_dict()
        item["units_sold"] = int(units_sold or 0)
        item["order_count"] = int(order_count or 0)
        data.append(item)

    return jsonify({"success": True, "data": data}), 200


@inventory_bp.route("/recommended", methods=["GET"])
def list_recommended():
    """Highlight active products by rating, then stock."""
    limit = min(max(request.args.get("limit", 8, type=int) or 8, 1), 24)
    products = (
        Product.query.filter(Product.is_active.is_(True))
        .order_by(
            Product.rating_stars.desc().nullslast(),
            Product.stock.desc(),
            Product.name.asc(),
        )
        .limit(limit)
        .all()
    )
    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in products],
    }), 200


@inventory_bp.route("/schools", methods=["GET"])
def list_schools():
    """Distinct schools with active product counts for catalog filters."""
    rows = (
        db.session.query(Product.school, func.count(Product.id))
        .filter(
            Product.is_active.is_(True),
            Product.school.isnot(None),
            Product.school != "",
        )
        .group_by(Product.school)
        .order_by(Product.school.asc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [
            {"name": name, "count": int(count)}
            for name, count in rows
            if name
        ],
    }), 200


@inventory_bp.route("/grades", methods=["GET"])
def list_grades():
    """Distinct grade tags with active product counts for catalog filters."""
    rows = (
        db.session.query(
            ProductGrade.grade,
            func.count(func.distinct(Product.id)),
        )
        .join(Product, ProductGrade.product_id == Product.id)
        .filter(Product.is_active.is_(True))
        .group_by(ProductGrade.grade)
        .all()
    )
    data = [
        {"name": name, "count": int(count)}
        for name, count in rows
        if name
    ]
    data.sort(key=lambda row: grade_sort_key(row["name"]))
    return jsonify({"success": True, "data": data}), 200


@inventory_bp.route("/<int:item_id>", methods=["GET"])
def get_inventory_item(item_id):
    product = Product.query.filter_by(id=item_id, is_active=True).first()
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404
    return jsonify({"success": True, "data": product.to_dict()}), 200


@inventory_bp.route("/<int:item_id>/ratings", methods=["GET"])
def list_product_ratings(item_id):
    product = Product.query.filter_by(id=item_id, is_active=True).first()
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    ratings = (
        ProductRating.query.filter_by(product_id=item_id)
        .order_by(ProductRating.updated_at.desc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [r.to_dict() for r in ratings],
        "summary": {
            "rating_stars": (
                float(product.rating_stars) if product.rating_stars is not None else None
            ),
            "rating_count": len(ratings),
        },
    }), 200


@inventory_bp.route("/<int:item_id>/ratings", methods=["POST"])
@jwt_required()
def upsert_product_rating(item_id):
    """Create or update the current customer's rating (1–5 stars)."""
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    data, error = validate_json(product_rating_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    product = Product.query.filter_by(id=item_id, is_active=True).first()
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    rating = ProductRating.query.filter_by(
        user_id=user.id, product_id=item_id
    ).first()
    created = False
    if rating:
        rating.stars = data["stars"]
        if "comment" in data:
            rating.comment = (data.get("comment") or "").strip() or None
    else:
        rating = ProductRating(
            user_id=user.id,
            product_id=item_id,
            stars=data["stars"],
            comment=(data.get("comment") or "").strip() or None,
        )
        db.session.add(rating)
        created = True

    db.session.flush()
    product.refresh_rating_average()
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Rating saved" if created else "Rating updated",
        "data": rating.to_dict(),
        "product": product.to_dict(),
    }), 201 if created else 200


@inventory_bp.route("/<int:item_id>/ratings", methods=["DELETE"])
@jwt_required()
def delete_product_rating(item_id):
    """Remove the current customer's rating."""
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    product = db.session.get(Product, item_id)
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    rating = ProductRating.query.filter_by(
        user_id=user.id, product_id=item_id
    ).first()
    if not rating:
        return jsonify({"success": False, "message": "Rating not found"}), 404

    db.session.delete(rating)
    db.session.flush()
    product.refresh_rating_average()
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Rating removed",
        "product": product.to_dict(),
    }), 200
