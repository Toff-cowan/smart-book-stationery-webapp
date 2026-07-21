"""Public serving of uploaded product images."""

from pathlib import Path

from flask import Blueprint, current_app, send_from_directory

uploads_bp = Blueprint("uploads", __name__)


def product_upload_dir() -> Path:
    root = Path(current_app.root_path).parent / "uploads" / "products"
    root.mkdir(parents=True, exist_ok=True)
    return root


@uploads_bp.route("/products/<path:filename>", methods=["GET"])
def serve_product_image(filename):
    """Serve a product image from disk (public)."""
    # Prevent path traversal — only basename is allowed
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return {"success": False, "message": "Invalid filename"}, 400
    directory = product_upload_dir()
    return send_from_directory(directory, safe_name)
