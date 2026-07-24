from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import and_, func, or_

from app.extensions.db import db
from app.models import Booklist, BooklistItem, Product, Notification


def get_or_create_draft_booklist(user_id):
    draft = Booklist.query.filter_by(
        user_id=user_id, status=Booklist.STATUS_DRAFT
    ).first()
    if draft:
        return draft
    draft = Booklist(user_id=user_id, status=Booklist.STATUS_DRAFT, title="My cart")
    db.session.add(draft)
    db.session.commit()
    return draft


def upsert_cart_item(booklist, product, quantity):
    quantity = int(quantity)
    if quantity < 1:
        raise ValueError("Quantity must be at least 1")

    item = BooklistItem.query.filter_by(
        booklist_id=booklist.id, product_id=product.id
    ).first()
    unit_price = Decimal(str(product.price))
    if item:
        item.quantity = quantity
        item.unit_price = unit_price
        item.line_total = unit_price * quantity
        item.product_name = product.name
    else:
        item = BooklistItem(
            booklist_id=booklist.id,
            product_id=product.id,
            product_name=product.name,
            quantity=quantity,
            unit_price=unit_price,
            line_total=unit_price * quantity,
        )
        db.session.add(item)

    db.session.flush()
    booklist.recalculate_total()
    db.session.commit()
    return item


def notify_user(user_id, title, body, type_="info", booklist_id=None, *, commit=True):
    note = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        booklist_id=booklist_id,
    )
    db.session.add(note)
    if commit:
        db.session.commit()
    return note


def notify_admins(title, body, type_="info", booklist_id=None):
    """Create an in-app notification for every staff account."""
    from app.models import User
    from app.utils.roles import STAFF_ROLES

    admins = User.query.filter(User.role.in_(tuple(STAFF_ROLES))).all()
    notes = []
    for admin in admins:
        notes.append(
            notify_user(
                admin.id,
                title,
                body,
                type_=type_,
                booklist_id=booklist_id,
                commit=False,
            )
        )
    db.session.commit()
    return notes


def purge_expired_orders(*, commit: bool = True) -> dict:
    """
    Hard-delete orders past retention:
    - cancelled (customer/admin deleted) older than 30 days
    - completed older than 1 year
    """
    now = datetime.now(timezone.utc)
    cancelled_cutoff = now - Booklist.CANCELLED_RETENTION
    completed_cutoff = now - Booklist.COMPLETED_RETENTION
    cancelled_ref = func.coalesce(Booklist.cancelled_at, Booklist.updated_at)
    completed_ref = func.coalesce(Booklist.completed_at, Booklist.updated_at)

    expired = (
        Booklist.query.filter(
            or_(
                and_(
                    Booklist.status == Booklist.STATUS_CANCELLED,
                    cancelled_ref < cancelled_cutoff,
                ),
                and_(
                    Booklist.status == Booklist.STATUS_COMPLETED,
                    completed_ref < completed_cutoff,
                ),
            )
        )
        .order_by(Booklist.id.asc())
        .all()
    )

    deleted_ids = []
    for order in expired:
        deleted_ids.append(order.id)
        Notification.query.filter_by(booklist_id=order.id).update(
            {"booklist_id": None},
            synchronize_session=False,
        )
        db.session.delete(order)

    if commit and deleted_ids:
        db.session.commit()
    elif not commit:
        db.session.flush()

    return {
        "purged": len(deleted_ids),
        "order_ids": deleted_ids,
    }

