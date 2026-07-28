"""Email helpers for bookstore notifications."""

from __future__ import annotations

import html
import logging
import os
import smtplib
from email.message import EmailMessage

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
    # Optional local public asset once hosted, e.g. https://yoursite.com/logo.png
    return None


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


def _send_via_resend(
    *,
    to_addr: str,
    subject: str,
    body: str,
    html_body: str | None,
    from_addr: str,
    reply_to: str | None,
) -> bool:
    """Send via Resend HTTPS API (works on Render free tier; SMTP ports are blocked)."""
    import json
    from urllib.error import HTTPError, URLError
    from urllib.request import Request, urlopen

    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    if not api_key:
        return False

    display_from = (os.getenv("RESEND_FROM") or "").strip() or from_addr
    if "<" not in display_from and "@" in display_from:
        display_from = f"{BRAND_NAME} <{display_from}>"

    payload: dict = {
        "from": display_from,
        "to": [to_addr],
        "subject": subject,
        "text": body,
    }
    if html_body:
        payload["html"] = html_body
    if reply_to:
        payload["reply_to"] = _email_address_only(reply_to) or reply_to

    req = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
    )
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=20) as res:
            res.read()
        logger.info("Resend email sent from=%s to=%s subject=%s", display_from, to_addr, subject)
        return True
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.exception("Resend failed to %s: %s", to_addr, detail)
        _set_last_mail_error(f"Resend HTTP {exc.code}: {detail[:300]}")
        return False
    except URLError as exc:
        logger.exception("Resend unreachable for %s", to_addr)
        _set_last_mail_error(f"Resend unreachable: {exc}")
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
    """Send email. Prefer Resend (HTTPS) when configured; else SMTP.

    Render free tier blocks outbound SMTP (ports 25/465/587), so production
    should set RESEND_API_KEY. Local SMTP via Gmail still works.
    """
    from_addr = _business_email()
    reply = reply_to or from_addr

    # Prefer HTTPS email API (works on Render free).
    if (os.getenv("RESEND_API_KEY") or "").strip():
        # Embedded CID images are SMTP-only; HTML still sends without them.
        return _send_via_resend(
            to_addr=to_addr,
            subject=subject,
            body=body,
            html_body=html_body,
            from_addr=from_addr,
            reply_to=reply,
        )

    mail_server = (os.getenv("MAIL_SERVER") or "").strip()
    if not mail_server:
        logger.warning(
            "No RESEND_API_KEY or MAIL_SERVER; email not sent from=%s to=%s subject=%s",
            from_addr,
            to_addr,
            subject,
        )
        _set_last_mail_error(
            "No email provider configured. On Render free tier, set RESEND_API_KEY "
            "(SMTP ports are blocked)."
        )
        return False

    display_from = from_addr
    if "<" not in from_addr and "@" in from_addr:
        display_from = f"{BRAND_NAME} <{from_addr}>"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = display_from
    msg["To"] = to_addr
    msg["Reply-To"] = reply
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
        if related_images:
            html_part = msg.get_payload()[-1]
            for cid, data, subtype in related_images:
                html_part.add_related(
                    data,
                    maintype="image",
                    subtype=subtype,
                    cid=cid,
                )

    port = int(os.getenv("MAIL_PORT", "587"))
    username = (os.getenv("MAIL_USERNAME") or _email_address_only(from_addr)).strip()
    password = (os.getenv("MAIL_PASSWORD") or "").replace(" ", "").strip()
    use_tls = (os.getenv("MAIL_USE_TLS", "true") or "true").lower() in (
        "1",
        "true",
        "yes",
    )

    try:
        with smtplib.SMTP(mail_server, port, timeout=20) as smtp:
            if use_tls:
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
        logger.info("Email sent from=%s to=%s subject=%s", from_addr, to_addr, subject)
        return True
    except Exception as exc:
        logger.exception("Failed to send email to %s", to_addr)
        hint = str(exc)
        if "timed out" in hint.lower() or "10060" in hint or "unreachable" in hint.lower():
            hint += (
                " — Render free tier blocks SMTP. Set RESEND_API_KEY for HTTPS email."
            )
        _set_last_mail_error(hint)
        return False


def last_mail_error() -> str | None:
    try:
        value = current_app.config.pop("LAST_MAIL_ERROR", None)
        return str(value) if value else None
    except RuntimeError:
        return None


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
            'width="180" style="display:block;max-width:180px;height:auto;margin:0 auto 8px;" />'
        )
    else:
        logo_block = (
            '<div style="margin:0 auto 12px;max-width:220px;padding:22px 16px;border:2px dashed #c5b89a;'
            "border-radius:8px;background:#faf7f0;color:#7a6f5d;font-size:12px;letter-spacing:0.06em;"
            'text-transform:uppercase;text-align:center;">'
            "Logo placeholder<br/>"
            "<span style=\"display:block;margin-top:6px;font-size:11px;letter-spacing:0;"
            'text-transform:none;color:#9a8f7c;">Set MAIL_LOGO_URL in backend/.env</span>'
            "</div>"
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
    try:
        current_app.config.pop("LAST_MAIL_ERROR", None)
    except RuntimeError:
        pass
    to_addr = (getattr(booklist, "contact_email", None) or user.email or "").strip()
    if not to_addr or "@" not in to_addr:
        logger.warning("No valid customer email for booklist=%s", getattr(booklist, "id", None))
        try:
            current_app.config["LAST_MAIL_ERROR"] = "Order has no valid notify email address."
        except RuntimeError:
            pass
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
        reply_to=_business_email(),
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
    """Confirm a new mailing-list signup."""
    to_addr = email.strip().lower()
    subject = f"You're subscribed — {BRAND_NAME}"
    plain = "\n".join(
        [
            f"Thanks for joining the {BRAND_NAME} mailing list.",
            "",
            "You'll get store updates, term reminders, and booklist news by email.",
            "We won't spam you — just useful updates from the bookstore.",
            "",
            f"Visit us online: {_site_url()}",
            "",
            f"If you did not subscribe, you can ignore this email or contact {_contact_email()}.",
            "",
            BRAND_NAME,
            _contact_email(),
        ]
    )
    html_body = _simple_store_html(
        title="Subscription confirmed",
        intro=f"You're on the list at {BRAND_NAME}.",
        body=(
            "Thanks for subscribing. You'll receive store updates, term reminders, "
            "and booklist news by email.\n\n"
            "If you did not sign up for this list, reply to this email and we'll help."
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
