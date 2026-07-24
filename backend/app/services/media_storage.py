"""Durable media storage via Supabase Storage (survives Render redeploys).

Falls back to local disk under UPLOAD_ROOT / backend/uploads when Supabase
env vars are not set (local development).
"""

from __future__ import annotations

import logging
import mimetypes
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

BUCKET = "product-images"


def _supabase_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")


def _supabase_key() -> str:
    return (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or ""
    ).strip()


def supabase_storage_enabled() -> bool:
    return bool(_supabase_url() and _supabase_key())


def public_object_url(object_path: str) -> str:
    base = _supabase_url()
    path = object_path.lstrip("/")
    return f"{base}/storage/v1/object/public/{BUCKET}/{path}"


def upload_bytes(
    *,
    folder: str,
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> str:
    """
    Store image bytes and return a URL for Product.image_url / avatar / carousel.

    When Supabase is configured → absolute public URL.
    Otherwise → save locally and return relative /api/uploads/... path.
    """
    folder = folder.strip("/").replace("\\", "/")
    filename = Path(filename).name
    object_path = f"{folder}/{filename}"
    mime = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    if supabase_storage_enabled():
        url = _supabase_url()
        key = _supabase_key()
        endpoint = f"{url}/storage/v1/object/{BUCKET}/{object_path}"
        req = Request(endpoint, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("apikey", key)
        req.add_header("Content-Type", mime)
        req.add_header("x-upsert", "true")
        try:
            with urlopen(req, timeout=60) as res:
                res.read()
        except HTTPError as exc:
            # Retry as upsert PUT if object exists and POST fails
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code in (400, 409):
                put = Request(endpoint, data=data, method="PUT")
                put.add_header("Authorization", f"Bearer {key}")
                put.add_header("apikey", key)
                put.add_header("Content-Type", mime)
                put.add_header("x-upsert", "true")
                try:
                    with urlopen(put, timeout=60) as res:
                        res.read()
                except HTTPError as put_exc:
                    put_detail = put_exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"Supabase storage upload failed ({put_exc.code}): {put_detail}"
                    ) from put_exc
            else:
                raise RuntimeError(
                    f"Supabase storage upload failed ({exc.code}): {detail}"
                ) from exc
        except URLError as exc:
            raise RuntimeError(f"Supabase storage unreachable: {exc}") from exc
        return public_object_url(object_path)

    # Local disk fallback
    from flask import current_app

    from app.routes.uploads_routes import _uploads_base

    dest_dir = _uploads_base() / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    dest.write_bytes(data)
    return f"/api/uploads/{folder}/{filename}"


def delete_stored_url(image_url: str | None) -> None:
    """Best-effort delete of a previously stored image (local or Supabase)."""
    if not image_url:
        return
    value = image_url.strip()

    # Local relative paths
    prefix = "/api/uploads/"
    if value.startswith(prefix):
        rel = value[len(prefix) :].split("?", 1)[0]
        parts = rel.split("/", 1)
        if len(parts) != 2:
            return
        folder, filename = parts
        if ".." in folder or ".." in filename or "/" in filename:
            return
        try:
            from app.routes.uploads_routes import _uploads_base

            path = _uploads_base() / folder / filename
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return

    # Supabase public URL
    marker = f"/storage/v1/object/public/{BUCKET}/"
    if marker not in value or not supabase_storage_enabled():
        return
    object_path = value.split(marker, 1)[-1].split("?", 1)[0]
    if not object_path or ".." in object_path:
        return
    url = _supabase_url()
    key = _supabase_key()
    endpoint = f"{url}/storage/v1/object/{BUCKET}/{object_path}"
    req = Request(endpoint, method="DELETE")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    try:
        with urlopen(req, timeout=30) as res:
            res.read()
    except (HTTPError, URLError) as exc:
        logger.warning("Failed to delete Supabase object %s: %s", object_path, exc)
