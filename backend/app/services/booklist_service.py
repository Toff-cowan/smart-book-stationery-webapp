from decimal import Decimal

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


def notify_user(user_id, title, body, type_="info", booklist_id=None):
    note = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        booklist_id=booklist_id,
    )
    db.session.add(note)
    db.session.commit()
    return note
