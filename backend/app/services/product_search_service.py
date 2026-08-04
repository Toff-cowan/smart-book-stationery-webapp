"""Fuzzy catalog search by product name or ISBN (site-wide browse)."""

from __future__ import annotations

import math
import re
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import or_

from app.models import Product
from app.services.book_match_service import (
    _STOPWORDS,
    normalize_query,
)

# Minimum fuzzy score to keep a hit in browse results.
MIN_SEARCH_SCORE = 45

# Keep grade / subject tokens that book-match treats as stopwords.
_SEARCH_KEEP_TOKENS = {
    "gr",
    "grade",
    "form",
    "lang",
    "arts",
    "maths",
    "reader",
    "integ",
    "wkbk",
    "k1",
    "k2",
}

_DIGIT_WORDS = {
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
    "10": "ten",
    "11": "eleven",
    "12": "twelve",
}


def _isbn_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _search_tokens(text: str) -> list[str]:
    """Tokens for catalog search — keep grade/subject words book-match drops."""
    tokens = []
    for tok in normalize_query(text).split():
        if tok in _STOPWORDS and tok not in _SEARCH_KEEP_TOKENS:
            continue
        if tok.isdigit() and len(tok) > 4:
            continue
        tokens.append(tok)
    return tokens


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
    try:
        for grade in product.get_grades():
            haystacks.append(normalize_query(grade))
    except Exception:
        pass
    isbn = (product.isbn or "").strip()
    if isbn:
        haystacks.append(normalize_query(isbn))
        digits = _isbn_digits(isbn)
        if digits:
            haystacks.append(digits)
    return haystacks


def _score_product(query: str, product: Product) -> float:
    q_norm = normalize_query(query)
    q_compact = " ".join(_search_tokens(query))
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

    # Soft boost when query tokens appear in the name or grade tags (any order).
    name_norm = normalize_query(product.name or "")
    grade_norm = " ".join(
        normalize_query(g) for g in (product.get_grades() or [])
    )
    searchable = f"{name_norm} {grade_norm}".strip()
    tokens = _search_tokens(query)
    if tokens and searchable:
        hit = 0
        for tok in tokens:
            if tok in searchable or any(
                part.startswith(tok) or tok.startswith(part)
                for part in searchable.split()
                if len(tok) >= 1 and len(part) >= 1
            ):
                hit += 1
        coverage = hit / len(tokens)
        # Short queries ("lang arts", "gr 1", "grade one") should still surface options.
        if coverage >= 0.5:
            best = max(best, 50.0 + coverage * 45.0)
        if coverage >= 1.0 and len(tokens) >= 2:
            best = max(best, 88.0)

    return best


def _candidate_filter(search: str):
    """Broad SQL prefilter so we do not score the entire catalog blindly."""
    from app.models import ProductGrade

    raw = search.strip()
    tokens = _search_tokens(raw)
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

    for tok in tokens[:8]:
        if len(tok) < 1:
            continue
        if len(tok) < 2 and not tok.isdigit():
            continue
        like = f"%{tok}%"
        clauses.append(Product.name.ilike(like))
        clauses.append(Product.author.ilike(like))
        clauses.append(Product.isbn.ilike(like))
        clauses.append(Product.publisher.ilike(like))
        clauses.append(Product.description.ilike(like))
        # Normalized abbreviations may not match raw SQL; also try common expansions.
        if tok == "integ":
            clauses.append(Product.name.ilike("%integrated%"))
        if tok == "gr":
            clauses.append(Product.name.ilike("%grade%"))
            clauses.append(ProductGrade.grade.ilike("%grade%"))
        if tok == "wkbk":
            clauses.append(Product.name.ilike("%workbook%"))
        if tok == "lang":
            clauses.append(Product.name.ilike("%language%"))
            clauses.append(Product.name.ilike("%language arts%"))
        if tok == "arts":
            clauses.append(Product.name.ilike("%arts%"))
        if tok == "maths":
            clauses.append(Product.name.ilike("%math%"))
        if tok == "reader":
            clauses.append(Product.name.ilike("%reader%"))
        # Digit ↔ word so SQL still finds "Grade Two" when query became "2".
        if tok.isdigit() and tok in _DIGIT_WORDS:
            word = _DIGIT_WORDS[tok]
            clauses.append(Product.name.ilike(f"%{word}%"))
            clauses.append(Product.description.ilike(f"%{word}%"))
            clauses.append(ProductGrade.grade.ilike(f"%{tok}%"))
            clauses.append(ProductGrade.grade.ilike(f"%{word}%"))
            clauses.append(ProductGrade.grade.ilike(f"%Grade {tok}%"))

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
        # Outer join so grade-tag matches still return products.
        candidate_q = candidate_q.outerjoin(Product.grade_tags).filter(filt).distinct()

    # Cap candidates for scoring; bookstore catalogs are typically modest.
    candidates = candidate_q.limit(800).all()
    if not candidates:
        # Fallback: score a wider active set when token filter was too strict.
        candidates = base_query.order_by(Product.name.asc()).limit(500).all()

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
