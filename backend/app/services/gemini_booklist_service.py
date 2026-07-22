"""Extract school booklist titles/authors with Gemini Flash (free tier)."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.6-flash"
# Prefer env model, then newer Flash models available to new free-tier keys.
FALLBACK_MODELS = (
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
)

API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

EXTRACT_PROMPT = """
You are extracting books from a school booklist photo for a bookstore inventory search.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "grade": "Grade 4 or null if unknown",
  "school": "school name or null if unknown",
  "books": [
    {"title": "exact printed book title", "author": "author(s) or null"}
  ]
}

Rules:
- Include only textbooks, workbooks, readers, dictionaries, atlases, and similar books.
- Ignore stationery/supplies (scrapbook, pencils, ruler, eraser, glue, composition books, etc.).
- Ignore section headers (LANGUAGE ARTS, MATHEMATICS, ADDITIONALS, etc.).
- Ignore handwritten prices, phone numbers, names, and "Not available" notes.
- Prefer printed text over handwriting.
- Keep titles clean: no leading numbers, bullets, or prices.
- If author is printed under/beside the title, include it; otherwise null.
- Do not invent books that are not on the page.
""".strip()


def gemini_configured() -> bool:
    return bool((os.getenv("GEMINI_API_KEY") or "").strip())


def _model_name() -> str:
    return (os.getenv("GEMINI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _mime_for_filename(filename: str | None) -> str:
    ext = ""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "heic": "image/heic",
        "heif": "image/heif",
    }.get(ext, "image/jpeg")


def _strip_json_fence(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _parse_books_payload(text: str) -> dict:
    cleaned = _strip_json_fence(text)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("Gemini returned non-object JSON")

    books_raw = data.get("books") or []
    books: list[dict] = []
    seen: set[str] = set()
    if isinstance(books_raw, list):
        for item in books_raw:
            if not isinstance(item, dict):
                continue
            title = " ".join(str(item.get("title") or "").split()).strip(" -–—:")
            author = " ".join(str(item.get("author") or "").split()).strip(" -–—:") or None
            if len(title) < 3:
                continue
            key = title.casefold()
            if key in seen:
                continue
            seen.add(key)
            books.append({"title": title, "author": author})

    grade = data.get("grade")
    school = data.get("school")
    return {
        "grade": str(grade).strip() if grade else None,
        "school": str(school).strip() if school else None,
        "books": books,
    }


def _candidate_models() -> list[str]:
    preferred = _model_name()
    ordered: list[str] = []
    for name in (preferred, *FALLBACK_MODELS):
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _call_gemini(api_key: str, model: str, body: dict) -> dict:
    req = urllib.request.Request(
        API_URL.format(model=model, key=api_key),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.error("Gemini HTTP %s (%s): %s", exc.code, model, detail[:500])
        err = RuntimeError(detail)
        err.code = exc.code  # type: ignore[attr-defined]
        err.detail = detail  # type: ignore[attr-defined]
        raise err from exc


def extract_books_with_gemini(
    image_bytes: bytes,
    *,
    filename: str | None = None,
) -> dict:
    """
    Call Gemini Flash with the booklist image and return editable title rows.
    Requires GEMINI_API_KEY in the environment (Google AI Studio free tier).
    """
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env from Google AI Studio."
        )

    mime = _mime_for_filename(filename)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": EXTRACT_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime,
                            "data": b64,
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    payload = None
    model_used = None
    last_error: Exception | None = None
    for model in _candidate_models():
        try:
            payload = _call_gemini(api_key, model, body)
            model_used = model
            break
        except RuntimeError as exc:
            last_error = exc
            code = getattr(exc, "code", None)
            detail = getattr(exc, "detail", "") or str(exc)
            if code == 429:
                raise RuntimeError(
                    "Gemini free-tier rate limit hit. Wait a minute and try again."
                ) from exc
            if code in (401, 403):
                raise RuntimeError(
                    "Gemini API key rejected. Check GEMINI_API_KEY in backend/.env."
                ) from exc
            # Model retired / not found for this key — try the next Flash model.
            if code == 404 or "no longer available" in detail.lower():
                continue
            raise RuntimeError(f"Gemini request failed ({code or 'error'}).") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                "Could not reach Gemini API. Check your internet connection."
            ) from exc

    if payload is None or model_used is None:
        raise RuntimeError(
            "No available Gemini Flash model for this API key. "
            "Set GEMINI_MODEL=gemini-3.6-flash in backend/.env and restart Flask."
        ) from last_error

    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Unexpected Gemini payload: %s", payload)
        raise RuntimeError("Gemini returned an unexpected response.") from exc

    parsed = _parse_books_payload(text)
    lines = []
    for idx, book in enumerate(parsed["books"]):
        lines.append(
            {
                "id": f"gemini-{idx}",
                "text": book["title"],
                "title": book["title"],
                "author": book["author"],
                "confidence": 92.0,
                "raw": book["title"]
                + (f" — {book['author']}" if book["author"] else ""),
            }
        )

    return {
        "lines": lines,
        "count": len(lines),
        "preview_jpeg_base64": None,
        "grade": parsed.get("grade"),
        "school": parsed.get("school"),
        "engine": "gemini",
        "model": model_used,
        "message": (
            f"Gemini ({model_used}) found {len(lines)} book(s)"
            + (f" for {parsed['grade']}" if parsed.get("grade") else "")
            + ". Review titles/authors before searching inventory."
            if lines
            else "Gemini did not find book titles. Try a clearer photo or enter titles manually."
        ),
    }
