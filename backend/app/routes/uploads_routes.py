"""Public serving of uploaded product and avatar images."""

from pathlib import Path

from flask import Blueprint, current_app, send_from_directory

uploads_bp = Blueprint("uploads", __name__)


def _uploads_base() -> Path:
    """Root for product/avatar/carousel files.

    Prefer UPLOAD_ROOT (Render persistent disk). Otherwise backend/uploads/.
    """
    configured = current_app.config.get("UPLOAD_ROOT")
    if configured:
        root = Path(configured)
    else:
        root = Path(current_app.root_path).parent / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def product_upload_dir() -> Path:
    root = _uploads_base() / "products"
    root.mkdir(parents=True, exist_ok=True)
    return root


def avatar_upload_dir() -> Path:
    root = _uploads_base() / "avatars"
    root.mkdir(parents=True, exist_ok=True)
    return root


def carousel_upload_dir() -> Path:
    root = _uploads_base() / "carousel"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_filename(filename: str) -> str | None:
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return None
    return safe_name


@uploads_bp.route("/products/<path:filename>", methods=["GET"])
def serve_product_image(filename):
    """Serve a product image from disk (public)."""
    safe_name = _safe_filename(filename)
    if not safe_name:
        return {"success": False, "message": "Invalid filename"}, 400
    return send_from_directory(product_upload_dir(), safe_name)


@uploads_bp.route("/avatars/<path:filename>", methods=["GET"])
def serve_avatar_image(filename):
    """Serve a user avatar from disk (public)."""
    safe_name = _safe_filename(filename)
    if not safe_name:
        return {"success": False, "message": "Invalid filename"}, 400
    return send_from_directory(avatar_upload_dir(), safe_name)


@uploads_bp.route("/carousel/<path:filename>", methods=["GET"])
def serve_carousel_image(filename):
    """Serve a carousel image from disk (public)."""
    safe_name = _safe_filename(filename)
    if not safe_name:
        return {"success": False, "message": "Invalid filename"}, 400
    return send_from_directory(carousel_upload_dir(), safe_name)
