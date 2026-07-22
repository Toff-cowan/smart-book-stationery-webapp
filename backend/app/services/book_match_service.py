"""Fuzzy-match OCR / typed titles against catalog products."""

from __future__ import annotations

import re

from rapidfuzz import fuzz, process
from sqlalchemy import func

from app.models import Product, ProductGrade


MATCH_THRESHOLD = 85
SUGGEST_THRESHOLD = 60


def normalize_query(text: str) -> str:
    value = (text or "").casefold()
    value = re.sub(r"[^\w\s]", " ", value)
    return " ".join(value.split())


def _catalog_query(*, school: str | None, grade: str | None):
    query = Product.query.filter(Product.is_active.is_(True))
    if school and school.strip():
        query = query.filter(func.lower(Product.school) == school.strip().casefold())
    if grade and grade.strip():
        query = (
            query.join(Product.grade_tags)
            .filter(func.lower(ProductGrade.grade) == grade.strip().casefold())
            .distinct()
        )
    return query.order_by(Product.name.asc())


def list_school_grade_products(*, school: str | None, grade: str | None) -> list[Product]:
    return _catalog_query(school=school, grade=grade).all()


def _product_choices(products: list[Product]) -> dict[str, Product]:
    """Map normalized searchable labels → product."""
    choices: dict[str, Product] = {}
    for product in products:
        labels = [product.name]
        if product.author:
            labels.append(f"{product.name} {product.author}")
            labels.append(product.author)
        if product.isbn:
            labels.append(product.isbn.replace("-", ""))
            labels.append(product.isbn)
        for label in labels:
            key = normalize_query(label)
            if key and key not in choices:
                choices[key] = product
    return choices


def _product_payload(product: Product, score: float) -> dict:
    return {
        "product_id": product.id,
        "name": product.name,
        "author": product.author,
        "isbn": product.isbn,
        "price": float(product.price),
        "stock": product.stock,
        "school": product.school,
        "grades": product.get_grades(),
        "confidence": round(float(score), 1),
        "did_you_mean": (
            f"Did you mean “{product.name}”?"
            if score < MATCH_THRESHOLD
            else None
        ),
    }


def match_titles(
    titles: list[str] | list[dict],
    *,
    school: str | None = None,
    grade: str | None = None,
) -> dict:
    # Prefer full active catalog for matching; optional school/grade narrows pool.
    search_pool = list_school_grade_products(school=school, grade=grade)
    if not search_pool and (school or grade):
        search_pool = Product.query.filter(Product.is_active.is_(True)).all()
    elif not search_pool:
        search_pool = Product.query.filter(Product.is_active.is_(True)).all()

    choices = _product_choices(search_pool)
    labels = list(choices.keys())

    results = []
    for raw in titles:
        author_hint = None
        if isinstance(raw, dict):
            query = str(raw.get("text") or raw.get("title") or "").strip()
            author_hint = (raw.get("author") or None)
            if author_hint:
                author_hint = str(author_hint).strip() or None
        else:
            query = str(raw or "").strip()
        if not query:
            continue

        search_blob = query if not author_hint else f"{query} {author_hint}"
        normalized = normalize_query(search_blob)
        if not normalized:
            continue

        if not labels:
            results.append(
                {
                    "query": query,
                    "author": author_hint,
                    "status": "unmatched",
                    "match": None,
                    "suggestions": [],
                    "message": "No catalog items found to match against.",
                }
            )
            continue

        ranked = process.extract(
            normalized,
            labels,
            scorer=fuzz.WRatio,
            limit=5,
        )

        # Also try title-only if author was included.
        if author_hint:
            title_only = process.extract(
                normalize_query(query),
                labels,
                scorer=fuzz.token_set_ratio,
                limit=3,
            )
            ranked = sorted(
                {r[0]: r for r in (ranked + title_only)}.values(),
                key=lambda r: r[1],
                reverse=True,
            )[:5]

        top_label, top_score, _ = ranked[0]
        top_product = choices[top_label]
        suggestions = [
            _product_payload(choices[label], score) for label, score, _ in ranked
        ]

        if top_score >= MATCH_THRESHOLD:
            status = "matched"
            message = None
            match = suggestions[0]
        elif top_score >= SUGGEST_THRESHOLD:
            status = "suggested"
            message = (
                suggestions[0]["did_you_mean"]
                or f"Did you mean “{top_product.name}”?"
            )
            match = None
        else:
            status = "unmatched"
            message = "No close match — try editing the title or pick a suggestion."
            match = None

        results.append(
            {
                "query": query,
                "author": author_hint,
                "status": status,
                "match": match,
                "suggestions": suggestions,
                "message": message,
            }
        )

    # Only return a browsable catalog when grade (or legacy school) is scoped —
    # never dump the entire inventory into the response.
    if school or grade:
        catalog_products = list_school_grade_products(school=school, grade=grade)
    else:
        catalog_products = []

    return {
        "results": results,
        "catalog": [p.to_dict() for p in catalog_products],
        "school": school,
        "grade": grade,
        "catalog_count": len(catalog_products),
    }
