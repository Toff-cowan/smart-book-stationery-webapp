from flask import Blueprint, jsonify, request

from app.extensions.db import db
from app.models import NewsletterSubscriber
from app.schemas import newsletter_subscribe_schema, validate_json
from app.services.mail_service import send_newsletter_confirmation

newsletter_bp = Blueprint("newsletter", __name__)


@newsletter_bp.route("/subscribe", methods=["POST"])
def subscribe_newsletter():
    data, error = validate_json(newsletter_subscribe_schema, request.get_json(silent=True))
    if error:
        body, status = error
        return jsonify(body), status

    email = data["email"].strip().lower()
    existing = NewsletterSubscriber.query.filter_by(email=email).first()
    if existing:
        return jsonify({
            "success": True,
            "message": "You are already on the mailing list.",
            "data": existing.to_dict(),
            "emailed": False,
        }), 200

    subscriber = NewsletterSubscriber(email=email)
    db.session.add(subscriber)
    db.session.commit()

    emailed = send_newsletter_confirmation(email)

    return jsonify({
        "success": True,
        "message": (
            "Welcome! You're subscribed — check your inbox for a welcome email from us."
            if emailed
            else "Welcome! You're subscribed to store updates."
        ),
        "data": subscriber.to_dict(),
        "emailed": emailed,
    }), 201
