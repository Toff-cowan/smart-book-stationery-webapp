"""Verify Supabase Auth access tokens (used for Google OAuth bridge)."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _supabase_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")


def _supabase_anon_key() -> str:
    return (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    ).strip()


def supabase_auth_configured() -> bool:
    return bool(_supabase_url() and _supabase_anon_key())


def fetch_supabase_user(access_token: str) -> dict[str, Any]:
    """
    Validate a Supabase access token and return the Auth user payload.

    Calls GET {SUPABASE_URL}/auth/v1/user
    """
    token = (access_token or "").strip()
    if not token:
        raise ValueError("Missing access token.")

    base = _supabase_url()
    key = _supabase_anon_key()
    if not base or not key:
        raise RuntimeError(
            "Google sign-in is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)."
        )

    endpoint = f"{base}/auth/v1/user"
    req = Request(endpoint, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("apikey", key)
    req.add_header("Accept", "application/json")

    try:
        with urlopen(req, timeout=20) as res:
            raw = res.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code in (401, 403):
            raise ValueError("Invalid or expired Google session.") from exc
        raise RuntimeError(
            f"Supabase Auth lookup failed ({exc.code}): {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Supabase Auth unreachable: {exc}") from exc

    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError("Supabase Auth returned invalid JSON.") from exc

    if not isinstance(payload, dict) or not payload.get("id"):
        raise ValueError("Invalid or expired Google session.")

    return payload


def supabase_user_profile(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract email, name, avatar, and id from a Supabase Auth user object."""
    user_id = str(payload.get("id") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    meta = payload.get("user_metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    identities = payload.get("identities") or []

    email_confirmed = bool(
        payload.get("email_confirmed_at")
        or payload.get("confirmed_at")
        or meta.get("email_verified")
    )
    # Google identities are usually pre-verified; accept when provider is google.
    if not email_confirmed and isinstance(identities, list):
        for identity in identities:
            if isinstance(identity, dict) and identity.get("provider") == "google":
                email_confirmed = True
                break

    name = (
        (meta.get("full_name") or meta.get("name") or meta.get("preferred_username") or "")
        .strip()
    )
    if not name and email:
        name = email.split("@", 1)[0]

    avatar = (meta.get("avatar_url") or meta.get("picture") or "").strip() or None

    return {
        "supabase_user_id": user_id or None,
        "email": email or None,
        "name": name or None,
        "avatar_url": avatar,
        "email_confirmed": email_confirmed,
    }
