from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import uuid

from flask import Blueprint, jsonify, request
from marshmallow import Schema, fields, validate, EXCLUDE
from sqlalchemy import func
from werkzeug.utils import secure_filename

from app.extensions.db import db
from app.models import Booklist, BooklistItem, HeroSlide, NewsletterSubscriber, Product, User
from app.services.media_storage import delete_stored_url, upload_bytes
from app.schemas import (
    hero_slide_create_schema,
    hero_slide_update_schema,
    inventory_create_schema,
    inventory_update_schema,
    newsletter_broadcast_schema,
    staff_create_schema,
    validate_json,
)
from app.services.booklist_service import notify_user
from app.services.mail_service import (
    last_mail_error,
    mail_provider_configured,
    notify_customer_about_order,
    send_store_update_broadcast,
)
from app.utils.auth import get_current_user
from app.utils.cache import invalidate_catalog_cache
from app.utils.decorators import admin_required, owner_required
from app.utils.roles import is_owner, is_staff, normalize_role
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import IntegrityError

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
    if "vendor" in data:
        product.vendor = data["vendor"]
    if "isbn" in data:
        product.isbn = (data["isbn"] or "").strip() or None
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
    from app.services.booklist_service import purge_expired_orders

    purge_expired_orders()
    status = request.args.get("status")
    bucket = (request.args.get("bucket") or "").strip().lower()
    query = Booklist.query.filter(
        Booklist.status != Booklist.STATUS_DRAFT,
        Booklist.retention_visible_clause(),
    )
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
    from app.services.booklist_service import purge_expired_orders

    purge_expired_orders()
    order = Booklist.query.filter(
        Booklist.id == order_id,
        Booklist.status != Booklist.STATUS_DRAFT,
        Booklist.retention_visible_clause(),
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404
    return jsonify({"success": True, "data": _order_to_admin_dict(order)}), 200


STATUS_UPDATE_COPY = {
    Booklist.STATUS_SUBMITTED: (
        "Your order was marked as submitted.",
        "Order submitted",
    ),
    Booklist.STATUS_IN_PROGRESS: (
        "The bookstore is preparing your order.",
        "Order in progress",
    ),
    Booklist.STATUS_READY: (
        "Your order is ready for pickup.",
        "Order ready for pickup",
    ),
    Booklist.STATUS_COMPLETED: (
        "Your order is complete. Thank you for shopping with us.",
        "Order completed",
    ),
    Booklist.STATUS_CANCELLED: (
        "Your order was cancelled by the bookstore.",
        "Order cancelled",
    ),
}


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
        Booklist.retention_visible_clause(),
    ).first()
    if not order:
        return jsonify({"success": False, "message": "Order not found"}), 404

    previous = order.status
    new_status = data["status"]
    order.status = new_status
    order.apply_status_timestamps(new_status)
    db.session.commit()

    if new_status != previous:
        body_text, title = STATUS_UPDATE_COPY.get(
            new_status,
            (f"Your order status is now {new_status}.", f"Order #{order.id} updated"),
        )
        customer = order.user or db.session.get(User, order.user_id)
        customer_name = customer.name if customer else "there"
        message = f"Hi {customer_name}, order #{order.id}: {body_text}"
        notify_user(
            user_id=order.user_id,
            title=title,
            body=message,
            type_="order_status",
            booklist_id=order.id,
        )
        emailed = False
        notify_to = None
        if customer:
            notify_to = (order.contact_email or customer.email or "").strip() or None
            emailed = notify_customer_about_order(
                customer,
                order,
                message=message,
            )
        if emailed:
            status_message = f"Status updated. Email sent to {notify_to}."
        elif not mail_provider_configured():
            status_message = (
                "Status updated (in-app only). "
                "Email skipped — set N8N_WEBHOOK_URL on Render."
            )
        else:
            detail = last_mail_error()
            status_message = (
                "Status updated (in-app only). "
                f"Email to {notify_to or '(missing address)'} failed"
                + (f": {detail}" if detail else ".")
            )
        return jsonify({
            "success": True,
            "message": status_message,
            "emailed": emailed,
            "emailed_to": notify_to,
            "data": _order_to_admin_dict(order),
        }), 200

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
        Booklist.retention_visible_clause(),
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

    notify_body = f"Hi {customer.name}, {message}"
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

    notify_to = (order.contact_email or customer.email or "").strip() or None
    if emailed:
        notify_message = f"Email sent to {notify_to}. In-app notification created."
    elif not mail_provider_configured():
        notify_message = (
            "Customer notified in-app only. "
            "Email skipped — set N8N_WEBHOOK_URL on Render."
        )
    else:
        detail = last_mail_error()
        notify_message = (
            "Customer notified in-app only. "
            f"Email to {notify_to or '(missing address)'} failed"
            + (f": {detail}" if detail else ".")
        )

    return jsonify({
        "success": True,
        "message": notify_message,
        "emailed": emailed,
        "emailed_to": notify_to,
        "data": _order_to_admin_dict(order),
    }), 200


@admin_bp.route("/stats/summary", methods=["GET"])
@owner_required
def stats_summary():
    from app.services.booklist_service import purge_expired_orders

    purge_expired_orders()
    visible = Booklist.retention_visible_clause()
    outstanding = (
        Booklist.query.filter(
            Booklist.status.in_(OUTSTANDING_STATUSES),
            visible,
        ).count()
    )
    completed = (
        Booklist.query.filter(
            Booklist.status == Booklist.STATUS_COMPLETED,
            visible,
        ).count()
    )
    cancelled = (
        Booklist.query.filter(
            Booklist.status == Booklist.STATUS_CANCELLED,
            visible,
        ).count()
    )
    revenue = (
        db.session.query(func.coalesce(func.sum(Booklist.grand_total), 0))
        .filter(
            Booklist.status.in_(Booklist.COMPLETED_STATUSES),
            visible,
        )
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
@owner_required
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


def _delete_carousel_file(image_url: str | None):
    delete_stored_url(image_url)

@admin_bp.route("/hero-slides", methods=["GET"])
@owner_required
def list_admin_hero_slides():
    slides = HeroSlide.query.order_by(
        HeroSlide.sort_order.asc(),
        HeroSlide.id.asc(),
    ).all()
    return jsonify({
        "success": True,
        "data": [s.to_dict() for s in slides],
    }), 200


@admin_bp.route("/hero-slides", methods=["POST"])
@owner_required
def create_hero_slide():
    data, error = validate_json(hero_slide_create_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    slide = HeroSlide(
        subtitle=data["subtitle"].strip(),
        primary_label=data["primary_label"].strip(),
        primary_href=data["primary_href"].strip(),
        secondary_label=data["secondary_label"].strip(),
        secondary_href=data["secondary_href"].strip(),
        sort_order=data.get("sort_order", 0),
        is_active=data.get("is_active", True),
    )
    db.session.add(slide)
    db.session.commit()
    invalidate_catalog_cache()
    return jsonify({
        "success": True,
        "message": "Slide created",
        "data": slide.to_dict(),
    }), 201


@admin_bp.route("/hero-slides/<int:slide_id>", methods=["PATCH"])
@owner_required
def update_hero_slide(slide_id):
    slide = db.session.get(HeroSlide, slide_id)
    if not slide:
        return jsonify({"success": False, "message": "Slide not found"}), 404

    data, error = validate_json(hero_slide_update_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    if not data:
        return jsonify({"success": False, "message": "No fields to update"}), 400

    for key in (
        "subtitle",
        "primary_label",
        "primary_href",
        "secondary_label",
        "secondary_href",
    ):
        if key in data and isinstance(data[key], str):
            setattr(slide, key, data[key].strip())
    if "sort_order" in data:
        slide.sort_order = data["sort_order"]
    if "is_active" in data:
        slide.is_active = data["is_active"]

    db.session.commit()
    invalidate_catalog_cache()
    return jsonify({
        "success": True,
        "message": "Slide updated",
        "data": slide.to_dict(),
    }), 200


@admin_bp.route("/hero-slides/<int:slide_id>/image", methods=["POST"])
@owner_required
def upload_hero_slide_image(slide_id):
    slide = db.session.get(HeroSlide, slide_id)
    if not slide:
        return jsonify({"success": False, "message": "Slide not found"}), 404

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

    stored_name = f"{slide.id}_{uuid.uuid4().hex}.{ext}"
    raw = file.read()
    old_url = slide.image_url
    try:
        slide.image_url = upload_bytes(
            folder="carousel",
            filename=stored_name,
            data=raw,
            content_type=file.mimetype,
        )
    except RuntimeError as exc:
        return jsonify({"success": False, "message": str(exc)}), 502
    db.session.commit()
    invalidate_catalog_cache()
    delete_stored_url(old_url)

    return jsonify({
        "success": True,
        "message": "Carousel image uploaded",
        "data": slide.to_dict(),
    }), 200


@admin_bp.route("/hero-slides/<int:slide_id>", methods=["DELETE"])
@owner_required
def delete_hero_slide(slide_id):
    slide = db.session.get(HeroSlide, slide_id)
    if not slide:
        return jsonify({"success": False, "message": "Slide not found"}), 404

    image_url = slide.image_url
    db.session.delete(slide)
    db.session.commit()
    invalidate_catalog_cache()
    _delete_carousel_file(image_url)

    return jsonify({
        "success": True,
        "message": "Slide deleted",
        "data": {"id": slide_id},
    }), 200


@admin_bp.route("/newsletter/subscribers", methods=["GET"])
@owner_required
def list_newsletter_subscribers():
    rows = NewsletterSubscriber.query.order_by(
        NewsletterSubscriber.created_at.desc()
    ).all()
    return jsonify({
        "success": True,
        "data": [row.to_dict() for row in rows],
        "count": len(rows),
    }), 200


@admin_bp.route("/newsletter/subscribers/<int:subscriber_id>", methods=["DELETE"])
@owner_required
def delete_newsletter_subscriber(subscriber_id):
    """Owner-only: remove an email from the mailing list."""
    row = db.session.get(NewsletterSubscriber, subscriber_id)
    if not row:
        return jsonify({"success": False, "message": "Subscriber not found"}), 404

    email = row.email
    db.session.delete(row)
    db.session.commit()
    return jsonify({
        "success": True,
        "message": f"Removed {email} from the mailing list",
        "data": {"id": subscriber_id},
    }), 200


@admin_bp.route("/newsletter/broadcast", methods=["POST"])
@owner_required
def broadcast_newsletter():
    """Owner-only: email a store update to mailing-list subscribers (and optional customers)."""
    # Support JSON or multipart (for optional image).
    if request.content_type and "multipart/form-data" in request.content_type:
        payload = {
            "subject": (request.form.get("subject") or "").strip(),
            "message": (request.form.get("message") or "").strip(),
            "include_registered_customers": (
                (request.form.get("include_registered_customers") or "")
                .strip()
                .lower()
                in ("1", "true", "yes", "on")
            ),
        }
    else:
        payload = request.get_json(silent=True)

    data, error = validate_json(newsletter_broadcast_schema, payload)
    if error:
        body, status = error
        return jsonify(body), status

    image_bytes = None
    image_subtype = None
    if "file" in request.files:
        file = request.files["file"]
        if file and file.filename:
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
                return jsonify({"success": False, "message": "Empty image file"}), 400
            if size > MAX_IMAGE_BYTES:
                return jsonify({
                    "success": False,
                    "message": "Image is too large (max 5 MB).",
                }), 400
            image_bytes = file.read()
            image_subtype = "jpeg" if ext in ("jpg", "jpeg") else ext

    recipients = [row.email for row in NewsletterSubscriber.query.all()]

    if data.get("include_registered_customers"):
        customers = User.query.filter(
            func.lower(User.role) == "customer"
        ).all()
        recipients.extend(u.email for u in customers if u.email)

    if not recipients:
        return jsonify({
            "success": False,
            "message": "No subscribers or customers to email yet.",
        }), 400

    result = send_store_update_broadcast(
        subject=data["subject"],
        message=data["message"],
        recipients=recipients,
        image_bytes=image_bytes,
        image_subtype=image_subtype,
    )

    if result["sent"] == 0 and result["total"] > 0:
        return jsonify({
            "success": False,
            "message": (
                "No emails were sent. Check N8N_WEBHOOK_URL and that the "
                "n8n workflow is active."
            ),
            "data": result,
        }), 502

    return jsonify({
        "success": True,
        "message": (
            f"Update sent to {result['sent']} of {result['total']} recipients."
            + (f" {result['failed']} failed." if result["failed"] else "")
            + (" Image included." if image_bytes else "")
        ),
        "data": result,
    }), 200


@admin_bp.route("/users", methods=["GET"])
@owner_required
def list_users():
    """Owner-only directory of registered users."""
    role = (request.args.get("role") or "").strip().lower()
    query = User.query
    if role:
        if role == "staff":
            query = query.filter(User.role.in_(("owner", "employee", "admin")))
        else:
            query = query.filter_by(role=role)

    users = query.order_by(User.created_at.desc().nullslast()).all()
    return jsonify({
        "success": True,
        "data": [u.to_admin_dict() for u in users],
    }), 200


@admin_bp.route("/users", methods=["POST"])
@owner_required
def create_staff_user():
    """Owner-only: create an employee or owner account."""
    data, error = validate_json(staff_create_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    email = data["email"].strip().lower()
    name = data["name"].strip()
    role = normalize_role(data["role"])
    password = data["password"]

    existing = User.query.filter_by(email=email).first()
    if existing:
        existing_role = normalize_role(existing.role)
        if is_staff(existing_role):
            return jsonify({
                "success": False,
                "message": "A staff account with this email already exists",
            }), 409
        # Promote an existing customer to staff
        existing.name = name or existing.name
        existing.role = role
        existing.password_hash = generate_password_hash(password)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Existing customer promoted to {role}",
            "data": existing.to_admin_dict(),
        }), 200

    user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role=role,
    )
    db.session.add(user)
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
        "message": f"{role.capitalize()} account created",
        "data": user.to_admin_dict(),
    }), 201


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@owner_required
def delete_staff_user(user_id):
    """Owner-only: remove an employee or another owner."""
    from app.models import Booklist, BooklistUpload, Message, Notification, ProductRating

    actor = get_current_user()
    if not actor:
        return jsonify({"success": False, "message": "User not found"}), 404

    if actor.id == user_id:
        return jsonify({
            "success": False,
            "message": "You cannot delete your own account",
        }), 400

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"success": False, "message": "User not found"}), 404

    target_role = normalize_role(target.role)
    if not is_staff(target_role):
        return jsonify({
            "success": False,
            "message": "Only employees and owners can be deleted here",
        }), 400

    if is_owner(target_role):
        owner_count = User.query.filter(
            func.lower(User.role).in_(("owner", "admin"))
        ).count()
        if owner_count <= 1:
            return jsonify({
                "success": False,
                "message": "Cannot delete the last owner account",
            }), 400

    if Booklist.query.filter_by(user_id=target.id).count() > 0:
        return jsonify({
            "success": False,
            "message": (
                "This account has orders or a cart. Remove those first, or keep "
                "the account."
            ),
        }), 409

    Notification.query.filter_by(user_id=target.id).delete(synchronize_session=False)
    Message.query.filter_by(user_id=target.id).delete(synchronize_session=False)
    ProductRating.query.filter_by(user_id=target.id).delete(synchronize_session=False)
    BooklistUpload.query.filter_by(user_id=target.id).update(
        {"user_id": None},
        synchronize_session=False,
    )

    db.session.delete(target)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Staff account deleted",
        "data": {"id": user_id},
    }), 200


@admin_bp.route("/inventory", methods=["GET"])
@admin_required
def list_admin_inventory():
    """List inventory items including inactive."""
    query = Product.query
    department = (request.args.get("department") or "").strip().lower()
    if department:
        if department not in Product.DEPARTMENTS:
            return jsonify({
                "success": False,
                "message": f"Invalid department. Use one of: {', '.join(Product.DEPARTMENTS)}",
            }), 400
        query = query.filter_by(department=department)

    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(like))
            | (Product.isbn.ilike(like))
            | (Product.vendor.ilike(like))
            | (Product.publisher.ilike(like))
            | (Product.author.ilike(like))
        )

    # Cap unfiltered dumps so the admin portal stays responsive.
    # The UI still supports client-side paging within the returned set.
    limit = min(max(request.args.get("limit", 2000, type=int) or 2000, 1), 5000)
    items = query.order_by(Product.name.asc()).limit(limit).all()
    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in items],
        "meta": {"returned": len(items), "limit": limit},
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
        vendor=data.get("vendor"),
        isbn=(data.get("isbn") or "").strip() or None,
        school=(data.get("school") or "").strip() or None,
        image_url=data.get("image_url"),
        is_active=data.get("is_active", True),
        category_id=data.get("category_id"),
    )
    db.session.add(product)
    db.session.flush()
    product.set_grades(data.get("grades") or [])
    db.session.commit()
    invalidate_catalog_cache()
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
    invalidate_catalog_cache()
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
    raw = file.read()
    old_url = product.image_url
    try:
        product.image_url = upload_bytes(
            folder="products",
            filename=stored_name,
            data=raw,
            content_type=file.mimetype,
        )
    except RuntimeError as exc:
        return jsonify({"success": False, "message": str(exc)}), 502
    db.session.commit()
    invalidate_catalog_cache()
    delete_stored_url(old_url)

    return jsonify({
        "success": True,
        "message": "Image uploaded",
        "data": product.to_dict(),
    }), 200


@admin_bp.route("/inventory/<int:item_id>", methods=["DELETE"])
@admin_required
def delete_inventory_item(item_id):
    """Permanently remove a product and its dependent rows."""
    product = db.session.get(Product, item_id)
    if not product:
        return jsonify({"success": False, "message": "Inventory item not found"}), 404

    booklist_ids = {
        row[0]
        for row in (
            db.session.query(BooklistItem.booklist_id)
            .filter_by(product_id=item_id)
            .distinct()
            .all()
        )
    }

    # Order/cart lines reference products without ORM cascade.
    BooklistItem.query.filter_by(product_id=item_id).delete(synchronize_session=False)

    image_url = product.image_url or ""
    # Ratings + grade tags cascade from the Product relationship.
    db.session.delete(product)

    for booklist_id in booklist_ids:
        booklist = db.session.get(Booklist, booklist_id)
        if booklist:
            booklist.recalculate_total()

    db.session.commit()
    invalidate_catalog_cache()
    delete_stored_url(image_url)

    return jsonify({
        "success": True,
        "message": "Inventory item deleted",
        "data": {"id": item_id},
    }), 200
