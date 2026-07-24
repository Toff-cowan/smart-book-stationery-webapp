from datetime import datetime, timedelta, timezone
from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Booklist, Notification, User
from app.services.booklist_service import purge_expired_orders


def _seed_customer(app):
    with app.app_context():
        user = User(
            name="Retention Shopper",
            email="retention@example.com",
            password_hash=generate_password_hash("password123"),
            role="customer",
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _make_order(app, user_id, status, *, when=None, grand_total="10.00"):
    with app.app_context():
        now = when or datetime.now(timezone.utc)
        order = Booklist(
            user_id=user_id,
            status=status,
            title="Retention order",
            grand_total=Decimal(grand_total),
            submitted_at=now,
            updated_at=now,
        )
        if status == Booklist.STATUS_CANCELLED:
            order.cancelled_at = now
        if status == Booklist.STATUS_COMPLETED:
            order.completed_at = now
        db.session.add(order)
        db.session.commit()
        return order.id


def test_purge_cancelled_after_30_days(app):
    user_id = _seed_customer(app)
    old_when = datetime.now(timezone.utc) - timedelta(days=31)
    fresh_when = datetime.now(timezone.utc) - timedelta(days=10)
    old_id = _make_order(app, user_id, Booklist.STATUS_CANCELLED, when=old_when)
    fresh_id = _make_order(app, user_id, Booklist.STATUS_CANCELLED, when=fresh_when)

    with app.app_context():
        result = purge_expired_orders()
        assert old_id in result["order_ids"]
        assert fresh_id not in result["order_ids"]
        assert db.session.get(Booklist, old_id) is None
        assert db.session.get(Booklist, fresh_id) is not None


def test_purge_completed_after_one_year(app):
    user_id = _seed_customer(app)
    old_when = datetime.now(timezone.utc) - timedelta(days=366)
    fresh_when = datetime.now(timezone.utc) - timedelta(days=100)
    old_id = _make_order(app, user_id, Booklist.STATUS_COMPLETED, when=old_when)
    fresh_id = _make_order(app, user_id, Booklist.STATUS_COMPLETED, when=fresh_when)

    with app.app_context():
        result = purge_expired_orders()
        assert old_id in result["order_ids"]
        assert fresh_id not in result["order_ids"]
        assert db.session.get(Booklist, old_id) is None
        assert db.session.get(Booklist, fresh_id) is not None


def test_retention_hides_expired_before_purge(app):
    user_id = _seed_customer(app)
    expired_when = datetime.now(timezone.utc) - timedelta(days=40)
    expired_id = _make_order(
        app, user_id, Booklist.STATUS_CANCELLED, when=expired_when
    )

    with app.app_context():
        visible = (
            Booklist.query.filter(
                Booklist.id == expired_id,
                Booklist.retention_visible_clause(),
            ).first()
        )
        assert visible is None
        # Do not purge yet — row still exists until purge runs
        assert db.session.get(Booklist, expired_id) is not None


def test_purge_nulls_notification_booklist_id(app):
    user_id = _seed_customer(app)
    old_when = datetime.now(timezone.utc) - timedelta(days=31)
    order_id = _make_order(app, user_id, Booklist.STATUS_CANCELLED, when=old_when)

    with app.app_context():
        note = Notification(
            user_id=user_id,
            title="Order cancelled",
            body="Gone soon",
            type="order_status",
            booklist_id=order_id,
        )
        db.session.add(note)
        db.session.commit()
        note_id = note.id

        purge_expired_orders()
        note = db.session.get(Notification, note_id)
        assert note is not None
        assert note.booklist_id is None
        assert db.session.get(Booklist, order_id) is None


def test_apply_status_timestamps(app):
    user_id = _seed_customer(app)
    with app.app_context():
        order = Booklist(
            user_id=user_id,
            status=Booklist.STATUS_SUBMITTED,
            grand_total=Decimal("5.00"),
        )
        db.session.add(order)
        db.session.flush()
        order.apply_status_timestamps(Booklist.STATUS_CANCELLED)
        assert order.cancelled_at is not None
        assert order.completed_at is None

        order2 = Booklist(
            user_id=user_id,
            status=Booklist.STATUS_READY,
            grand_total=Decimal("5.00"),
        )
        db.session.add(order2)
        db.session.flush()
        order2.apply_status_timestamps(Booklist.STATUS_COMPLETED)
        assert order2.completed_at is not None
        db.session.commit()
