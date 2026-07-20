"""Email helpers for bookstore notifications."""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from flask import current_app

logger = logging.getLogger(__name__)


def _send_email(
    *,
    to_addr: str,
    subject: str,
    body: str,
    reply_to: str | None = None,
) -> bool:
    mail_server = (os.getenv("MAIL_SERVER") or "").strip()
    if not mail_server:
        logger.info(
            "Email not configured; logging instead to=%s\n%s\n%s",
            to_addr,
            subject,
            body,
        )
        try:
            current_app.logger.info(
                "Email (logged only) to=%s subject=%s", to_addr, subject
            )
        except RuntimeError:
            pass
        return False

    from_addr = os.getenv("MAIL_FROM") or os.getenv("BOOKSTORE_NOTIFY_EMAIL") or to_addr
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    if reply_to:
        msg["Reply-To"] = reply_to
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
        logger.exception("Failed to send email to %s", to_addr)
        return False


def _format_request_body(user, booklist) -> str:
    contact_email = getattr(booklist, "contact_email", None) or user.email
    contact_phone = getattr(booklist, "contact_phone", None) or "(not provided)"
    lines = [
        "New cart request (no online payment).",
        "",
        f"Customer: {user.name}",
        f"Account email: {user.email}",
        f"Notify email: {contact_email}",
        f"Phone: {contact_phone}",
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
    to_addr = (
        os.getenv("BOOKSTORE_NOTIFY_EMAIL")
        or os.getenv("SEED_ADMIN_EMAIL")
        or "bookstore@smartbook.local"
    ).strip()
    reply_to = getattr(booklist, "contact_email", None) or user.email
    return _send_email(
        to_addr=to_addr,
        subject=f"Cart request #{booklist.id} from {user.name}",
        body=_format_request_body(user, booklist),
        reply_to=reply_to,
    )


def notify_customer_about_order(
    user,
    booklist,
    *,
    message: str,
    confirmed_total: float | None = None,
    ready_at: str | None = None,
) -> bool:
    to_addr = getattr(booklist, "contact_email", None) or user.email
    lines = [
        f"Hi {user.name},",
        "",
        f"Update from Smart Book Stationery about order #{booklist.id}:",
        "",
        message.strip(),
        "",
    ]
    if confirmed_total is not None:
        lines.append(f"Confirmed total: ${float(confirmed_total):.2f}")
    if ready_at:
        lines.append(f"Ready for pickup: {ready_at}")
    phone = getattr(booklist, "contact_phone", None)
    if phone:
        lines.append(f"(We also have your phone on file: {phone})")
    lines.extend(
        [
            "",
            "No online payment is required — pay when you collect your package.",
            "",
            "— Smart Book Stationery",
        ]
    )
    return _send_email(
        to_addr=to_addr,
        subject=f"Update on your bookstore order #{booklist.id}",
        body="\n".join(lines),
        reply_to=os.getenv("BOOKSTORE_NOTIFY_EMAIL") or os.getenv("MAIL_FROM"),
    )


def notify_bookstore_of_order_cancellation(
    user, booklist, *, previous_status: str | None = None
) -> bool:
    to_addr = (
        os.getenv("BOOKSTORE_NOTIFY_EMAIL")
        or os.getenv("SEED_ADMIN_EMAIL")
        or "bookstore@smartbook.local"
    ).strip()
    contact_email = getattr(booklist, "contact_email", None) or user.email
    contact_phone = getattr(booklist, "contact_phone", None) or "(not provided)"
    prior = previous_status or "(unknown)"
    body = "\n".join(
        [
            "A customer cancelled / deleted their bookstore order.",
            "",
            f"Customer: {user.name}",
            f"Account email: {user.email}",
            f"Notify email: {contact_email}",
            f"Phone: {contact_phone}",
            f"Order #: {booklist.id}",
            f"Previous status: {prior}",
            f"Listed subtotal: ${float(booklist.grand_total or 0):.2f}",
            "",
            "Please stop preparing this order if work has not already started.",
        ]
    )
    return _send_email(
        to_addr=to_addr,
        subject=f"Order #{booklist.id} cancelled by {user.name}",
        body=body,
        reply_to=contact_email,
    )
