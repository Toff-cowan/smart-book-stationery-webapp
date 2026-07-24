"""Simple in-process response cache for public catalog endpoints."""

from __future__ import annotations

import hashlib
import threading
import time
from functools import wraps
from typing import Any, Callable

from flask import Response, request


class _CacheEntry:
    __slots__ = ("expires_at", "payload", "status")

    def __init__(self, payload: Any, status: int, ttl: float):
        self.payload = payload
        self.status = status
        self.expires_at = time.monotonic() + ttl


class SimpleTTLCache:
    def __init__(self):
        self._lock = threading.RLock()
        self._store: dict[str, _CacheEntry] = {}

    def get(self, key: str):
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if entry.expires_at <= time.monotonic():
                self._store.pop(key, None)
                return None
            return entry

    def set(self, key: str, payload: Any, status: int, ttl: float):
        with self._lock:
            self._store[key] = _CacheEntry(payload, status, ttl)

    def clear(self, prefix: str | None = None):
        with self._lock:
            if prefix is None:
                self._store.clear()
                return
            for key in list(self._store):
                if key.startswith(prefix):
                    self._store.pop(key, None)


catalog_cache = SimpleTTLCache()


def _cache_key(namespace: str) -> str:
    raw = f"{namespace}|{request.full_path}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return f"{namespace}:{digest}"


def cached_json(namespace: str, ttl: int = 60):
    """Cache JSON responses for GET handlers (query-string aware)."""

    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method != "GET":
                return fn(*args, **kwargs)

            key = _cache_key(namespace)
            hit = catalog_cache.get(key)
            if hit is not None:
                response = jsonify_cached(hit.payload, hit.status)
                response.headers["X-Cache"] = "HIT"
                return response

            result = fn(*args, **kwargs)
            body, status = _normalize_view_result(result)
            catalog_cache.set(key, body, status, ttl)
            response = jsonify_cached(body, status)
            response.headers["X-Cache"] = "MISS"
            return response

        return wrapper

    return decorator


def jsonify_cached(payload: Any, status: int = 200) -> Response:
    from flask import jsonify, make_response

    return make_response(jsonify(payload), status)


def _normalize_view_result(result):
    if isinstance(result, tuple):
        body, status = result[0], result[1]
    else:
        body, status = result, 200

    if isinstance(body, Response):
        payload = body.get_json(silent=True)
        return payload if payload is not None else {}, body.status_code

    return body, status


def invalidate_catalog_cache():
    """Drop cached catalog/hero responses after inventory changes."""
    catalog_cache.clear(prefix="inventory:")
    catalog_cache.clear(prefix="hero:")
    catalog_cache.clear(prefix="products:")
