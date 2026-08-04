"""Email helpers for bookstore notifications."""

from __future__ import annotations

import html
import logging
import os

from flask import current_app

logger = logging.getLogger(__name__)

BRAND_NAME = "Smart Books Stationery and Supplies Ltd"
DEFAULT_BUSINESS_EMAIL = "smartsbookstore24@gmail.com"
DEFAULT_SITE_URL = "http://localhost:3000"


def _business_email() -> str:
    return (
        os.getenv("MAIL_FROM")
        or os.getenv("BOOKSTORE_NOTIFY_EMAIL")
        or DEFAULT_BUSINESS_EMAIL
    ).strip()


def _contact_email() -> str:
    return _email_address_only(_business_email()) or DEFAULT_BUSINESS_EMAIL


def _contact_phone() -> str | None:
    phone = (os.getenv("BOOKSTORE_PHONE") or "").strip()
    return phone or None


def _site_url() -> str:
    return (os.getenv("FRONTEND_URL") or os.getenv("PUBLIC_SITE_URL") or DEFAULT_SITE_URL).rstrip(
        "/"
    )


def _logo_url() -> str | None:
    url = (os.getenv("MAIL_LOGO_URL") or "").strip()
    if url:
        return url
    # Default: public asset on the frontend host (frontend/public/email-logo.png)
    return f"{_site_url()}/email-logo.png"


def _order_url(order_id: int) -> str:
    return f"{_site_url()}/orders?order={order_id}"


def _email_address_only(value: str) -> str:
    text = (value or "").strip()
    if "<" in text and ">" in text:
        return text.split("<", 1)[1].split(">", 1)[0].strip()
    return text


def _set_last_mail_error(message: str) -> None:
    try:
        current_app.config["LAST_MAIL_ERROR"] = message
    except RuntimeError:
        pass


def last_mail_error() -> str | None:
    try:
        value = current_app.config.pop("LAST_MAIL_ERROR", None)
        return str(value) if value else None
    except RuntimeError:
        return None


def mail_provider_configured() -> bool:
    return bool((os.getenv("N8N_WEBHOOK_URL") or "").strip())


def _send_via_n8n(
    *,
    to_addr: str,
    subject: str,
    body: str,
    html_body: str | None,
    from_addr: str,
    reply_to: str | None,
) -> bool:
    """POST email payload to an n8n webhook (Gmail node sends the mail)."""
    import json
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    webhook = (os.getenv("N8N_WEBHOOK_URL") or "").strip()
    if not webhook:
        return False

    # Gmail node requires bare addresses — not "Name <email@x.com>".
    to_clean = _email_address_only(to_addr)
    reply_clean = _email_address_only(reply_to or from_addr) or _email_address_only(from_addr)
    from_clean = _email_address_only(from_addr) or from_addr

    if not to_clean or "@" not in to_clean:
        _set_last_mail_error(f"Invalid To address: {to_addr!r}")
        return False

    payload = {
        "to": to_clean,
        "subject": subject,
        "text": body,
        "html": html_body or body,
        "from": from_clean,
        "reply_to": reply_clean,
        "brand": BRAND_NAME,
    }

    data = json.dumps(payload).encode("utf-8")
    req = Request(webhook, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "smart-book-stationery-webapp/1.0")
    secret = (os.getenv("N8N_WEBHOOK_SECRET") or "").strip()
    if secret:
        req.add_header("Authorization", f"Bearer {secret}")
        req.add_header("X-Webhook-Secret", secret)

    try:
        with urlopen(req, timeout=30) as res:
            res.read()
        logger.info("n8n email webhook OK to=%s subject=%s", to_clean, subject)
        return True
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.exception("n8n webhook failed to=%s: %s", to_clean, detail)
        _set_last_mail_error(f"n8n HTTP {exc.code}: {detail[:300]}")
        return False
    except URLError as exc:
        logger.exception("n8n webhook unreachable")
        _set_last_mail_error(f"n8n unreachable: {exc}")
        return False


def _send_email(
    *,
    to_addr: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    reply_to: str | None = None,
    related_images: list[tuple[str, bytes, str]] | None = None,
) -> bool:
    """Send email via n8n → Gmail only (HTTPS webhook; works on Render free)."""
    del related_images  # CID embeds were SMTP-only; HTML body is enough for n8n/Gmail
    try:
        current_app.config.pop("LAST_MAIL_ERROR", None)
    except RuntimeError:
        pass

    from_addr = _business_email()
    reply = reply_to or from_addr

    if not (os.getenv("N8N_WEBHOOK_URL") or "").strip():
        logger.warning("N8N_WEBHOOK_URL not set; email not sent to=%s", to_addr)
        _set_last_mail_error(
            "N8N_WEBHOOK_URL is not set. Configure the n8n webhook on Render."
        )
        return False

    return _send_via_n8n(
        to_addr=to_addr,
        subject=subject,
        body=body,
        html_body=html_body,
        from_addr=from_addr,
        reply_to=reply,
    )


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
    to_addr = _email_address_only(_business_email())
    reply_to = getattr(booklist, "contact_email", None) or user.email
    return _send_email(
        to_addr=to_addr,
        subject=f"Cart request #{booklist.id} from {user.name}",
        body=_format_request_body(user, booklist),
        reply_to=reply_to,
    )


def _order_items_plain(booklist) -> list[str]:
    lines = ["Items on your order:"]
    items = list(getattr(booklist, "items", None) or [])
    if not items:
        lines.append("  (No line items on file.)")
        return lines
    for item in items:
        lines.append(
            f"  • {item.product_name} × {item.quantity} "
            f"— ${float(item.unit_price):.2f} each "
            f"(${float(item.line_total):.2f})"
        )
    listed = float(booklist.grand_total or 0)
    lines.append(f"  Listed subtotal: ${listed:.2f}")
    return lines


def _order_items_html(booklist) -> str:
    items = list(getattr(booklist, "items", None) or [])
    if not items:
        return "<p style=\"margin:0;color:#555;\">(No line items on file.)</p>"

    rows = []
    for item in items:
        rows.append(
            "<tr>"
            f"<td style=\"padding:8px 10px;border-bottom:1px solid #e8e4dc;\">"
            f"{html.escape(item.product_name)}</td>"
            f"<td style=\"padding:8px 10px;border-bottom:1px solid #e8e4dc;text-align:center;\">"
            f"{int(item.quantity)}</td>"
            f"<td style=\"padding:8px 10px;border-bottom:1px solid #e8e4dc;text-align:right;\">"
            f"${float(item.unit_price):.2f}</td>"
            f"<td style=\"padding:8px 10px;border-bottom:1px solid #e8e4dc;text-align:right;\">"
            f"${float(item.line_total):.2f}</td>"
            "</tr>"
        )
    listed = float(booklist.grand_total or 0)
    return (
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
        "style=\"border-collapse:collapse;font-size:14px;color:#222;\">"
        "<thead><tr>"
        "<th align=\"left\" style=\"padding:8px 10px;border-bottom:2px solid #1f4d2e;font-size:12px;"
        "text-transform:uppercase;letter-spacing:0.04em;color:#1f4d2e;\">Item</th>"
        "<th style=\"padding:8px 10px;border-bottom:2px solid #1f4d2e;font-size:12px;"
        "text-transform:uppercase;letter-spacing:0.04em;color:#1f4d2e;\">Qty</th>"
        "<th align=\"right\" style=\"padding:8px 10px;border-bottom:2px solid #1f4d2e;font-size:12px;"
        "text-transform:uppercase;letter-spacing:0.04em;color:#1f4d2e;\">Each</th>"
        "<th align=\"right\" style=\"padding:8px 10px;border-bottom:2px solid #1f4d2e;font-size:12px;"
        "text-transform:uppercase;letter-spacing:0.04em;color:#1f4d2e;\">Line</th>"
        "</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "<tfoot><tr>"
        "<td colspan=\"3\" style=\"padding:10px;text-align:right;font-weight:700;\">"
        "Listed subtotal</td>"
        f"<td style=\"padding:10px;text-align:right;font-weight:700;\">${listed:.2f}</td>"
        "</tr></tfoot></table>"
    )


def _customer_letter_plain(
    user,
    booklist,
    *,
    message: str,
    confirmed_total: float | None,
    ready_at: str | None,
) -> str:
    order_link = _order_url(booklist.id)
    contact_email = _contact_email()
    contact_phone = _contact_phone()
    customer_phone = getattr(booklist, "contact_phone", None)

    lines = [
        f"[ Logo — {BRAND_NAME} ]",
        "",
        f"Dear {user.name},",
        "",
        f"Thank you for choosing {BRAND_NAME}.",
        f"This note is about your order #{booklist.id}.",
        "",
        message.strip(),
        "",
    ]
    lines.extend(_order_items_plain(booklist))
    lines.append("")

    if confirmed_total is not None:
        lines.append(f"Confirmed total: ${float(confirmed_total):.2f}")
    if ready_at:
        lines.append(f"Ready for pickup: {ready_at}")
    if customer_phone:
        lines.append(f"Phone on file for this order: {customer_phone}")

    lines.extend(
        [
            "",
            "No online payment is required. Please pay when you collect your package.",
            "",
            "View your order online (sign in if prompted):",
            f"  {order_link}",
            "",
            "How to reach us",
            f"  Email: {contact_email}",
        ]
    )
    if contact_phone:
        lines.append(f"  Phone: {contact_phone}")
    lines.extend(
        [
            f"  Website: {_site_url()}",
            "",
            "If anything on this order needs changing, reply to this email and we will help.",
            "",
            "With appreciation,",
            BRAND_NAME,
            contact_email,
        ]
    )
    return "\n".join(lines)


def _customer_letter_html(
    user,
    booklist,
    *,
    message: str,
    confirmed_total: float | None,
    ready_at: str | None,
) -> str:
    order_link = _order_url(booklist.id)
    contact_email = _contact_email()
    contact_phone = _contact_phone()
    customer_phone = getattr(booklist, "contact_phone", None)
    logo = _logo_url()

    if logo:
        logo_block = (
            f'<img src="{html.escape(logo)}" alt="{html.escape(BRAND_NAME)}" '
            'width="160" style="display:block;max-width:160px;height:auto;margin:0 auto 8px;" />'
        )
    else:
        logo_block = (
            f'<p style="margin:0 auto 12px;text-align:center;font-weight:700;color:#1f4d2e;">'
            f"{html.escape(BRAND_NAME)}</p>"
        )

    details = []
    if confirmed_total is not None:
        details.append(
            f"<p style=\"margin:0 0 6px;\"><strong>Confirmed total:</strong> "
            f"${float(confirmed_total):.2f}</p>"
        )
    if ready_at:
        details.append(
            f"<p style=\"margin:0 0 6px;\"><strong>Ready for pickup:</strong> "
            f"{html.escape(ready_at)}</p>"
        )
    if customer_phone:
        details.append(
            f"<p style=\"margin:0;\"><strong>Phone on file:</strong> "
            f"{html.escape(customer_phone)}</p>"
        )
    details_html = "".join(details) or (
        "<p style=\"margin:0;color:#666;\">We will confirm total and pickup timing shortly.</p>"
    )

    phone_row = ""
    if contact_phone:
        phone_row = (
            f"<p style=\"margin:0 0 4px;\"><strong>Phone:</strong> "
            f"{html.escape(contact_phone)}</p>"
        )

    return f"""\
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f3efe6;font-family:Georgia,'Times New Roman',serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2d9c8;">
          <tr>
            <td style="padding:28px 28px 16px;background:#1f4d2e;color:#fff;text-align:center;">
              {logo_block}
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#f0e2a8;">
                {html.escape(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:16px;line-height:1.55;">
              <p style="margin:0 0 16px;">Dear {html.escape(user.name)},</p>
              <p style="margin:0 0 16px;">
                Thank you for choosing <strong>{html.escape(BRAND_NAME)}</strong>.
                This note is about your order <strong>#{booklist.id}</strong>.
              </p>
              <p style="margin:0 0 20px;padding:14px 16px;background:#faf7f0;border-left:4px solid #c9a227;">
                {html.escape(message.strip()).replace(chr(10), "<br/>")}
              </p>
              <h2 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#1f4d2e;">
                Your order items
              </h2>
              {_order_items_html(booklist)}
              <div style="margin:20px 0;padding:14px 16px;background:#f4f8f5;border:1px solid #d5e4da;">
                {details_html}
              </div>
              <p style="margin:0 0 18px;">
                No online payment is required. Please pay when you collect your package.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="{html.escape(order_link)}"
                   style="display:inline-block;padding:12px 22px;background:#1f4d2e;color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                  View your order
                </a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#555;text-align:center;font-family:Arial,Helvetica,sans-serif;">
                Or open this link: <a href="{html.escape(order_link)}" style="color:#1f4d2e;">{html.escape(order_link)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;font-size:15px;line-height:1.5;">
              <h2 style="margin:12px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#1f4d2e;">
                How to contact us
              </h2>
              <p style="margin:0 0 4px;"><strong>Email:</strong> <a href="mailto:{html.escape(contact_email)}" style="color:#1f4d2e;">{html.escape(contact_email)}</a></p>
              {phone_row}
              <p style="margin:0 0 16px;"><strong>Website:</strong> <a href="{html.escape(_site_url())}" style="color:#1f4d2e;">{html.escape(_site_url())}</a></p>
              <p style="margin:0 0 18px;">
                If anything on this order needs changing, simply reply to this email and we will gladly help.
              </p>
              <p style="margin:0;">With appreciation,</p>
              <p style="margin:4px 0 0;font-weight:700;">{html.escape(BRAND_NAME)}</p>
              <p style="margin:2px 0 0;color:#555;">{html.escape(contact_email)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def notify_customer_about_order(
    user,
    booklist,
    *,
    message: str,
    confirmed_total: float | None = None,
    ready_at: str | None = None,
) -> bool:
    to_addr = _email_address_only(
        getattr(booklist, "contact_email", None) or user.email or ""
    )
    if not to_addr or "@" not in to_addr:
        logger.warning("No valid customer email for booklist=%s", getattr(booklist, "id", None))
        _set_last_mail_error("Order has no valid notify email address.")
        return False
    plain = _customer_letter_plain(
        user,
        booklist,
        message=message,
        confirmed_total=confirmed_total,
        ready_at=ready_at,
    )
    html_body = _customer_letter_html(
        user,
        booklist,
        message=message,
        confirmed_total=confirmed_total,
        ready_at=ready_at,
    )
    return _send_email(
        to_addr=to_addr,
        subject=f"Your order #{booklist.id} — {BRAND_NAME}",
        body=plain,
        html_body=html_body,
        reply_to=_email_address_only(_business_email()),
    )


def notify_bookstore_of_order_cancellation(
    user, booklist, *, previous_status: str | None = None
) -> bool:
    to_addr = _email_address_only(_business_email())
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


def _simple_store_html(
    *,
    title: str,
    intro: str,
    body: str,
    image_cid: str | None = None,
) -> str:
    contact_email = _contact_email()
    contact_phone = _contact_phone()
    logo = _logo_url()
    paragraphs = "".join(
        f"<p style=\"margin:0 0 12px;line-height:1.5;color:#333;\">"
        f"{html.escape(part)}</p>"
        for part in body.strip().split("\n\n")
        if part.strip()
    ) or (
        f"<p style=\"margin:0 0 12px;line-height:1.5;color:#333;\">"
        f"{html.escape(body.strip())}</p>"
    )

    if logo:
        logo_block = (
            f'<img src="{html.escape(logo)}" alt="{html.escape(BRAND_NAME)}" '
            'width="160" style="display:block;max-width:160px;height:auto;margin:0 0 16px;" />'
        )
    else:
        logo_block = (
            f'<p style="margin:0 0 16px;font-weight:700;color:#1f4d2e;">'
            f"{html.escape(BRAND_NAME)}</p>"
        )

    image_block = ""
    if image_cid:
        image_block = (
            f'<div style="margin:0 0 18px;">'
            f'<img src="cid:{html.escape(image_cid)}" alt="" '
            'style="display:block;width:100%;max-width:512px;height:auto;'
            'border-radius:8px;" />'
            "</div>"
        )

    phone_row = ""
    if contact_phone:
        phone_row = (
            f"<p style=\"margin:4px 0 0;color:#555;\">Phone: "
            f"{html.escape(contact_phone)}</p>"
        )

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;padding:28px 24px;
              border:1px solid #e2e8e4;border-radius:8px;">
    {logo_block}
    <h1 style="margin:0 0 8px;font-size:20px;color:#1f4d2e;">{html.escape(title)}</h1>
    <p style="margin:0 0 16px;color:#51665d;">{html.escape(intro)}</p>
    {image_block}
    {paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
    <p style="margin:0;color:#555;font-size:13px;">
      {html.escape(BRAND_NAME)}<br/>
      Email: {html.escape(contact_email)}
    </p>
    {phone_row}
    <p style="margin:12px 0 0;color:#555;font-size:13px;">
      <a href="{html.escape(_site_url())}" style="color:#1f4d2e;">
        Visit our store online
      </a>
    </p>
  </div>
</body></html>"""


def send_newsletter_confirmation(email: str) -> bool:
    """Automatic welcome message sent when someone joins the mailing list."""
    to_addr = email.strip().lower()
    subject = f"Welcome to {BRAND_NAME}"
    site = _site_url()
    plain = "\n".join(
        [
            f"Welcome to {BRAND_NAME}!",
            "",
            "Thanks for joining our mailing list. You're all set.",
            "",
            "We'll email you about:",
            "  • New stock and term booklists",
            "  • Store updates and reminders",
            "  • Special offers when we have them",
            "",
            "We keep messages useful — no spam.",
            "",
            f"Browse the catalog anytime: {site}/catalog",
            f"Or visit us online: {site}",
            "",
            f"If you did not subscribe, reply to this email or contact {_contact_email()} "
            "and we'll remove you.",
            "",
            f"— {BRAND_NAME}",
            _contact_email(),
        ]
    )
    html_body = _simple_store_html(
        title=f"Welcome to {BRAND_NAME}",
        intro="You're on the mailing list — thanks for joining us.",
        body=(
            "This is your automatic welcome message confirming your subscription.\n\n"
            "You'll hear from us about new stock, school booklists, term reminders, "
            "and store updates. We keep messages useful and infrequent.\n\n"
            f"Browse the catalog whenever you're ready: {site}/catalog\n\n"
            "If you did not sign up, reply to this email and we'll help right away."
        ),
    )
    return _send_email(
        to_addr=to_addr,
        subject=subject,
        body=plain,
        html_body=html_body,
    )


def send_store_update_broadcast(
    *,
    subject: str,
    message: str,
    recipients: list[str],
    image_bytes: bytes | None = None,
    image_subtype: str | None = None,
) -> dict:
    """Send a store update to many recipients. Returns sent/failed counts."""
    clean_subject = subject.strip()
    clean_message = message.strip()
    unique = sorted({addr.strip().lower() for addr in recipients if addr and "@" in addr})
    image_cid = "storeupdate"
    related = None
    if image_bytes and image_subtype:
        related = [(image_cid, image_bytes, image_subtype)]

    sent = 0
    failed = 0
    for to_addr in unique:
        plain_lines = [
            f"Update from {BRAND_NAME}",
            "",
            clean_message,
            "",
        ]
        if related:
            plain_lines.append("(This email includes an image from the bookstore.)")
            plain_lines.append("")
        plain_lines.extend(
            [
                f"Visit us: {_site_url()}",
                "",
                BRAND_NAME,
                _contact_email(),
            ]
        )
        plain = "\n".join(plain_lines)
        html_body = _simple_store_html(
            title=clean_subject,
            intro=f"A store update from {BRAND_NAME}",
            body=clean_message,
            image_cid=image_cid if related else None,
        )
        ok = _send_email(
            to_addr=to_addr,
            subject=clean_subject,
            body=plain,
            html_body=html_body,
            related_images=related,
        )
        if ok:
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "total": len(unique)}
