"""Notify the bookstore when a customer requests a cart quote."""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from flask import current_app

logger = logging.getLogger(__name__)


def _format_request_body(user, booklist) -> str:
    lines = [
        "New cart request (no online payment).",
        "",
        f"Customer: {user.name}",
        f"Email: {user.email}",
        f"Order #: {booklist.id}",
        f"Fulfillment: {booklist.fulfillment_type or 'pickup'}",
        f"Listed subtotal: ${float(booklist.grand_total or 0):.2f}",
        "",
        "Please reply to the customer with:",
        "1) which items you have in stock",
        "2) the confirmed total cost",
        "3) when the package will be ready for pickup",
        "",
        "Items requested:",
    ]
    for item in booklist.items:
        lines.append(
            f"- {item.product_name} × {item.quantity} "
            f"(${float(item.unit_price):.2f} each, line ${float(item.line_total):.2f})"
        )
    if booklist.notes:
        lines.extend(["", f"Customer notes: {booklist.notes}"])
    return "\n".join(lines)


def notify_bookstore_of_cart_request(user, booklist) -> bool:
    """
    Email the bookstore about a cart request.

    Uses SMTP when MAIL_SERVER is configured; otherwise logs the message
    so local/dev still records the request.
    """
    to_addr = (
        os.getenv("BOOKSTORE_NOTIFY_EMAIL")
        or os.getenv("SEED_ADMIN_EMAIL")
        or "bookstore@smartbook.local"
    ).strip()
    subject = f"Cart request #{booklist.id} from {user.name}"
    body = _format_request_body(user, booklist)

    mail_server = (os.getenv("MAIL_SERVER") or "").strip()
    if not mail_server:
        logger.info(
            "Bookstore cart request (email not configured) to=%s\n%s",
            to_addr,
            body,
        )
        try:
            current_app.logger.info(
                "Cart request #%s emailed to %s (logged only)",
                booklist.id,
                to_addr,
            )
        except RuntimeError:
            pass
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("MAIL_FROM", to_addr)
    msg["To"] = to_addr
    msg["Reply-To"] = user.email
    msg.set_content(body)

    port = int(os.getenv("MAIL_PORT", "587"))
    username = os.getenv("MAIL_USERNAME") or ""
    password = os.getenv("MAIL_PASSWORD") or ""
    use_tls = (os.getenv("MAIL_USE_TLS", "true") or "true").lower() in (
        "1",
        "true",
        "yes",
    )

    try:
        with smtplib.SMTP(mail_server, port, timeout=20) as smtp:
            if use_tls:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send bookstore cart request email")
        return False
