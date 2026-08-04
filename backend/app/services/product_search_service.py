"""Fuzzy catalog search by product name or ISBN (site-wide browse)."""

from __future__ import annotations

import math
import re
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import func, or_

from app.models import Product
from app.services.book_match_service import (
    _STOPWORDS,
    normalize_query,
)

# Minimum fuzzy score to keep a hit in browse results.
MIN_SEARCH_SCORE = 55

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
    """Fields used for free-text fuzzy match (name-focused, not grade tags)."""
    fields = [
        product.name,
        product.author,
        product.publisher,
        product.vendor,
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


def _token_hit(tok: str, parts: list[str]) -> bool:
    """Whole-word / sensible prefix match — never let 'in' satisfy 'infant'."""
    if not tok or not parts:
        return False
    if tok in parts:
        return True
    for part in parts:
        # Query token is a prefix of a product word ("math" → "maths").
        if len(tok) >= 2 and len(part) >= len(tok) and part.startswith(tok):
            return True
        # Product word is a longer stem of the query token.
        if (
            len(part) >= 4
            and len(tok) >= 4
            and len(tok) >= len(part)
            and tok.startswith(part)
        ):
            return True
    return False


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

    name_norm = normalize_query(product.name or "")
    parts = name_norm.split()
    tokens = _search_tokens(query)
    hit = sum(1 for tok in tokens if _token_hit(tok, parts)) if tokens else 0
    coverage = (hit / len(tokens)) if tokens else 0.0

    best = 0.0
    # Score against the title (and other identity fields) — not bare grade
    # tags, otherwise every Grade-1-tagged pen ranks for "grade one".
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
        if len(q_norm) >= 3:
            best = max(best, float(fuzz.partial_ratio(q_norm, hay)))

    if tokens and coverage >= 0.5:
        best = max(best, 50.0 + coverage * 45.0)
    if tokens and coverage >= 1.0 and len(tokens) >= 2:
        best = max(best, 88.0)

    # Multi-word queries must share real words with the title — stops "in"
    # false-matches and junk stationery ranking for textbook searches.
    if len(tokens) >= 2:
        min_hits = 2 if len(tokens) >= 3 else 1
        if hit < min_hits:
            return 0.0

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
        # ISBNs are often stored with hyphens — match on digit-only form too.
        isbn_digits_expr = func.replace(
            func.replace(func.coalesce(Product.isbn, ""), "-", ""),
            " ",
            "",
        )
        clauses.append(isbn_digits_expr.ilike(f"%{digits}%"))
        clauses.append(Product.isbn.ilike(f"%{digits}%"))
        if len(digits) >= 10:
            clauses.append(isbn_digits_expr.ilike(f"%{digits[-10:]}%"))
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
    # Do not fall back to scoring the whole catalog — that surfaces junk
    # (pens, unrelated titles) when the SQL prefilter is empty.

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
