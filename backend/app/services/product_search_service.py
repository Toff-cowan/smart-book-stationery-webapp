"""Fuzzy catalog search by product name or ISBN (site-wide browse)."""

from __future__ import annotations

import math
import re
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import or_

from app.models import Product
from app.services.book_match_service import (
    _significant_tokens,
    normalize_query,
)

# Minimum fuzzy score to keep a hit in browse results.
MIN_SEARCH_SCORE = 52


def _isbn_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _product_haystacks(product: Product) -> list[str]:
    fields = [
        product.name,
        product.author,
        product.publisher,
        product.vendor,
        product.description,
        product.school,
    ]
    haystacks = [normalize_query(f) for f in fields if f and str(f).strip()]
    isbn = (product.isbn or "").strip()
    if isbn:
        haystacks.append(normalize_query(isbn))
        digits = _isbn_digits(isbn)
        if digits:
            haystacks.append(digits)
    return haystacks


def _score_product(query: str, product: Product) -> float:
    q_norm = normalize_query(query)
    q_compact = " ".join(_significant_tokens(query))
    q_digits = _isbn_digits(query)

    if q_digits and len(q_digits) >= 8:
        product_digits = _isbn_digits(product.isbn)
        if product_digits and (
            q_digits == product_digits
            or q_digits in product_digits
            or product_digits in q_digits
        ):
            return 100.0

    if not q_norm:
        return 0.0

    best = 0.0
    for hay in _product_haystacks(product):
        if not hay:
            continue
        best = max(
            best,
            float(fuzz.WRatio(q_norm, hay)),
            float(fuzz.token_set_ratio(q_norm, hay)),
            float(fuzz.token_sort_ratio(q_norm, hay)),
        )
        if q_compact and q_compact != q_norm:
            best = max(
                best,
                float(fuzz.token_set_ratio(q_compact, hay)),
                float(fuzz.token_sort_ratio(q_compact, hay)),
            )
        # Prefix / typo tolerance on the product name.
        if len(q_norm) >= 3:
            best = max(best, float(fuzz.partial_ratio(q_norm, hay)))

    # Soft boost when most query tokens appear in the name (any order).
    name_norm = normalize_query(product.name or "")
    tokens = _significant_tokens(query)
    if tokens and name_norm:
        hit = 0
        for tok in tokens:
            if tok in name_norm or any(
                part.startswith(tok) or tok.startswith(part)
                for part in name_norm.split()
                if len(tok) >= 2 and len(part) >= 2
            ):
                hit += 1
        coverage = hit / len(tokens)
        if coverage >= 0.6:
            best = max(best, 55.0 + coverage * 40.0)

    return best


def _candidate_filter(search: str):
    """Broad SQL prefilter so we do not score the entire catalog blindly."""
    raw = search.strip()
    tokens = _significant_tokens(raw)
    digits = _isbn_digits(raw)
    clauses = []

    if raw:
        like = f"%{raw}%"
        clauses.append(Product.name.ilike(like))
        clauses.append(Product.author.ilike(like))
        clauses.append(Product.isbn.ilike(like))
        clauses.append(Product.publisher.ilike(like))
        clauses.append(Product.vendor.ilike(like))
        clauses.append(Product.description.ilike(like))

    for tok in tokens[:6]:
        if len(tok) < 2 and not tok.isdigit():
            continue
        like = f"%{tok}%"
        clauses.append(Product.name.ilike(like))
        clauses.append(Product.author.ilike(like))
        clauses.append(Product.isbn.ilike(like))
        clauses.append(Product.publisher.ilike(like))
        # Normalized abbreviations may not match raw SQL; also try common expansions.
        if tok == "integ":
            clauses.append(Product.name.ilike("%integrated%"))
        if tok == "gr":
            clauses.append(Product.name.ilike("%grade%"))
        if tok == "wkbk":
            clauses.append(Product.name.ilike("%workbook%"))
        if tok == "lang":
            clauses.append(Product.name.ilike("%language%"))
        if tok == "maths":
            clauses.append(Product.name.ilike("%math%"))
        if tok == "reader":
            clauses.append(Product.name.ilike("%reader%"))

    if digits and len(digits) >= 8:
        clauses.append(Product.isbn.ilike(f"%{digits}%"))
        # Match ISBNs stored with hyphens by walking digit chunks.
        if len(digits) >= 10:
            clauses.append(Product.isbn.ilike(f"%{digits[-10:]}%"))

    if not clauses:
        return None
    return or_(*clauses)


def search_products(
    base_query,
    search: str,
    *,
    page: int = 1,
    per_page: int = 20,
) -> dict[str, Any]:
    """
    Rank active products for a free-text query (name / author / ISBN).

    Returns dict with keys: items (Product list), total, page, per_page, pages.
    """
    page = max(page, 1)
    per_page = min(max(per_page, 1), 100)
    term = (search or "").strip()

    if not term:
        pagination = base_query.order_by(Product.name.asc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        return {
            "items": list(pagination.items),
            "total": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "pages": pagination.pages,
        }

    candidate_q = base_query
    filt = _candidate_filter(term)
    if filt is not None:
        candidate_q = candidate_q.filter(filt)

    # Cap candidates for scoring; bookstore catalogs are typically modest.
    candidates = candidate_q.limit(500).all()
    if not candidates:
        # Fallback: score a wider active set when token filter was too strict.
        candidates = base_query.order_by(Product.name.asc()).limit(400).all()

    scored: list[tuple[float, Product]] = []
    for product in candidates:
        score = _score_product(term, product)
        if score >= MIN_SEARCH_SCORE:
            scored.append((score, product))

    scored.sort(key=lambda row: (-row[0], (row[1].name or "").casefold()))
    total = len(scored)
    pages = max(1, math.ceil(total / per_page)) if total else 0
    start = (page - 1) * per_page
    page_rows = scored[start : start + per_page]
    items = [row[1] for row in page_rows]

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }
