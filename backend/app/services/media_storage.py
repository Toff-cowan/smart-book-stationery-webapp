"""Durable media storage via Cloudinary (survives Render redeploys).

Falls back to Supabase Storage when Cloudinary is not configured, then to
local disk under UPLOAD_ROOT / backend/uploads for local development.

Upload flow: image bytes → Cloudinary → secure_url → stored in DB (image_url).
"""

from __future__ import annotations

import logging
import mimetypes
import os
import re
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

BUCKET = "product-images"

# Cloudinary delivery URLs look like:
# https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<id>.jpg
_CLOUDINARY_UPLOAD_RE = re.compile(
    r"/image/upload/(?:[^/]+/)*?(?:v\d+/)?(?P<public_id>.+?)(?:\.[a-zA-Z0-9]+)?(?:\?.*)?$"
)


def _cloudinary_cloud_name() -> str:
    return (os.getenv("CLOUDINARY_CLOUD_NAME") or "").strip()


def _cloudinary_api_key() -> str:
    return (os.getenv("CLOUDINARY_API_KEY") or "").strip()


def _cloudinary_api_secret() -> str:
    return (os.getenv("CLOUDINARY_API_SECRET") or "").strip()


def cloudinary_enabled() -> bool:
    return bool(
        _cloudinary_cloud_name()
        and _cloudinary_api_key()
        and _cloudinary_api_secret()
    )


def _configure_cloudinary() -> None:
    import cloudinary

    cloudinary.config(
        cloud_name=_cloudinary_cloud_name(),
        api_key=_cloudinary_api_key(),
        api_secret=_cloudinary_api_secret(),
        secure=True,
    )


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


def _cloudinary_public_id(folder: str, filename: str) -> str:
    stem = Path(filename).stem
    folder = folder.strip("/").replace("\\", "/")
    return f"{folder}/{stem}" if folder else stem


def _upload_cloudinary(
    *,
    folder: str,
    filename: str,
    data: bytes,
) -> str:
    import cloudinary.uploader

    _configure_cloudinary()
    public_id = _cloudinary_public_id(folder, filename)
    ext = Path(filename).suffix.lstrip(".") or None
    try:
        result = cloudinary.uploader.upload(
            BytesIO(data),
            public_id=public_id,
            resource_type="image",
            overwrite=True,
            invalidate=True,
            format=ext,
        )
    except Exception as exc:  # noqa: BLE001 — surface as RuntimeError to callers
        raise RuntimeError(f"Cloudinary upload failed: {exc}") from exc

    url = (result.get("secure_url") or result.get("url") or "").strip()
    if not url:
        raise RuntimeError("Cloudinary upload returned no URL.")
    return url


def _parse_cloudinary_public_id(image_url: str) -> str | None:
    """Extract Cloudinary public_id from a delivery URL for destroy()."""
    if "res.cloudinary.com" not in image_url and "cloudinary.com" not in image_url:
        return None
    match = _CLOUDINARY_UPLOAD_RE.search(image_url)
    if not match:
        return None
    public_id = match.group("public_id").strip("/")
    return public_id or None


def upload_bytes(
    *,
    folder: str,
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> str:
    """
    Store image bytes and return a URL for Product.image_url / avatar / carousel.

    When Cloudinary is configured → absolute Cloudinary secure_url (saved to DB).
    Else when Supabase is configured → absolute public URL.
    Otherwise → save locally and return relative /api/uploads/... path.
    """
    folder = folder.strip("/").replace("\\", "/")
    filename = Path(filename).name
    object_path = f"{folder}/{filename}"
    mime = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    if cloudinary_enabled():
        return _upload_cloudinary(folder=folder, filename=filename, data=data)

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
    from app.routes.uploads_routes import _uploads_base

    dest_dir = _uploads_base() / folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    dest.write_bytes(data)
    return f"/api/uploads/{folder}/{filename}"


def delete_stored_url(image_url: str | None) -> None:
    """Best-effort delete of a previously stored image (Cloudinary / local / Supabase)."""
    if not image_url:
        return
    value = image_url.strip()

    # Cloudinary delivery URL
    public_id = _parse_cloudinary_public_id(value)
    if public_id and cloudinary_enabled():
        try:
            import cloudinary.uploader

            _configure_cloudinary()
            cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete Cloudinary object %s: %s", public_id, exc)
        return

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
