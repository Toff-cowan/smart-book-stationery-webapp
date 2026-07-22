"""Public landing / hero carousel endpoints."""

from flask import Blueprint, jsonify

from app.models import HeroSlide
from app.utils.cache import cached_json

hero_bp = Blueprint("hero", __name__)


@hero_bp.route("/hero-slides", methods=["GET"])
@cached_json("hero:list", ttl=120)
def list_public_hero_slides():
    slides = (
        HeroSlide.query.filter_by(is_active=True)
        .order_by(HeroSlide.sort_order.asc(), HeroSlide.id.asc())
        .all()
    )
    return jsonify({
        "success": True,
        "data": [s.to_dict() for s in slides],
    }), 200
