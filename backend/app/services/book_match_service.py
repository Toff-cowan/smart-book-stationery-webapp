"""Fuzzy-match OCR / typed titles against catalog products."""

from __future__ import annotations

import re

from rapidfuzz import fuzz, process
from sqlalchemy import func

from app.models import Product, ProductGrade


MATCH_THRESHOLD = 78
SUGGEST_THRESHOLD = 58
MIN_SUGGESTION_SCORE = 55

# Noise words common on printed booklists but missing from POS short names.
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "the",
        "of",
        "to",
        "for",
        "in",
        "on",
        "with",
        "by",
        "or",
        "new",
        "revised",
        "edition",
        "ed",
        "series",
        "level",
        "student",
        "students",
        "book",
        "books",
        "skills",
        "developing",
        "development",
        "writing",
        "reading",
        "comprehension",
        "test",
        "tests",
        "pack",
        "primary",
        "secondary",
        "jamaica",
        "jamaican",
    }
)

# Common subject words that alone should not force a match.
_GENERIC_SUBJECTS = frozenset(
    {
        "literacy",
        "maths",
        "math",
        "mathematics",
        "science",
        "english",
        "language",
        "lang",
        "arts",
        "social",
        "studies",
        "ss",
        "phonics",
        "spelling",
        "grammar",
        "history",
        "geography",
        "religious",
        "education",
        "computer",
        "integrated",
        "integ",
        "ability",
        "task",
        "performance",
        "wkbk",
        "workbook",
        "gr",
        "grade",
        "form",
    }
)

_ABBREV = (
    (r"\bworkbook(s)?\b", "wkbk"),
    (r"\bwkbk\b", "wkbk"),
    (r"\bgrade\b", "gr"),
    (r"\bgr\b", "gr"),
    (r"\bform\b", "form"),
    (r"\bintegrated\b", "integ"),
    (r"\binteg\b", "integ"),
    (r"\bmathematics\b", "maths"),
    (r"\bmath\b", "maths"),
    (r"\blanguage\b", "lang"),
    (r"\bsocial studies\b", "ss"),
    (r"\bperformance task(s)?\b", "performance task"),
)


def normalize_query(text: str) -> str:
    value = (text or "").casefold()
    value = value.replace("&", " and ")
    value = re.sub(r"[^\w\s]", " ", value)
    for pattern, repl in _ABBREV:
        value = re.sub(pattern, repl, value)
    return " ".join(value.split())


def _significant_tokens(text: str) -> list[str]:
    tokens = []
    for tok in normalize_query(text).split():
        if tok in _STOPWORDS:
            continue
        if tok.isdigit() and len(tok) > 4:
            continue
        tokens.append(tok)
    return tokens


def _compact_query(text: str) -> str:
    """Shorter query closer to POS names (drop fluff, keep key words + numbers)."""
    return " ".join(_significant_tokens(text))


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


def _match_pool(*, grade: str | None) -> list[Product]:
    """
    Always search the full active catalog for title matching.

    Grade tags are sparse / often wrong (e.g. a pen tagged Grade 4), so a hard
    grade filter previously hid real textbooks that have no grade tags.
    """
    del grade  # kept for API compatibility; used only as a soft ranking boost
    return (
        Product.query.filter(Product.is_active.is_(True))
        .order_by(Product.name.asc())
        .all()
    )


def _product_choices(products: list[Product]) -> dict[str, Product]:
    """Map normalized searchable labels → product."""
    choices: dict[str, Product] = {}
    for product in products:
        labels = [product.name]
        compact = _compact_query(product.name)
        if compact and compact != normalize_query(product.name):
            labels.append(compact)
        if product.author:
            labels.append(f"{product.name} {product.author}")
        if product.isbn:
            labels.append(product.isbn.replace("-", ""))
            labels.append(product.isbn)
        for label in labels:
            key = normalize_query(label)
            if key and key not in choices:
                choices[key] = product
            compact_key = _compact_query(label)
            if compact_key and compact_key not in choices:
                choices[compact_key] = product
    return choices


def _department_boost(product: Product) -> float:
    if product.department == "textbooks":
        return 8.0
    if product.department == "stationery":
        return -12.0
    return 0.0


def _extract_grade_digit(*texts: str | None) -> str | None:
    for text in texts:
        if not text:
            continue
        # Prefer explicit grade/form markers before bare trailing numbers.
        marked = re.search(
            r"\b(?:grade|gr|form)\s*(\d{1,2})\b",
            text,
            flags=re.IGNORECASE,
        )
        if marked:
            return marked.group(1)
        trailing = re.search(r"(?:^|\s)(\d{1,2})(?:\s*$)", text.strip())
        if trailing:
            return trailing.group(1)
    return None


def _grade_boost(product: Product, grade: str | None, query: str | None = None) -> float:
    digit = _extract_grade_digit(grade, query)
    if not digit:
        return 0.0

    name = product.name.casefold()
    product_grades = [g.casefold() for g in product.get_grades()]
    boost = 0.0

    if any(digit in g for g in product_grades) or (
        grade and grade.strip().casefold() in product_grades
    ):
        boost += 4.0

    if re.search(rf"(?:^|\D){re.escape(digit)}(?:\D|$)", name):
        boost += 10.0
    else:
        # Penalize clear wrong-grade siblings (Task 5 when query wants 4).
        other = re.findall(r"(?:^|\D)(\d{1,2})(?:\D|$)", name)
        if other and digit not in other:
            boost -= 8.0

    return boost


def _score_pair(query: str, label: str) -> float:
    compact_q = _compact_query(query) or query
    scores = [
        fuzz.WRatio(query, label),
        fuzz.token_set_ratio(query, label),
        fuzz.partial_ratio(query, label),
        fuzz.WRatio(compact_q, label),
        fuzz.token_set_ratio(compact_q, label),
        fuzz.partial_ratio(compact_q, label),
    ]
    return float(max(scores))


def _rank_labels(query: str, labels: list[str], *, limit: int = 8) -> list[tuple[str, float]]:
    if not labels:
        return []
    # First pass: cheap WRatio shortlist from full label set
    shortlist = process.extract(
        query,
        labels,
        scorer=fuzz.WRatio,
        limit=min(40, max(limit * 6, 20)),
    )
    compact = _compact_query(query)
    if compact and compact != query:
        shortlist += process.extract(
            compact,
            labels,
            scorer=fuzz.token_set_ratio,
            limit=min(40, max(limit * 6, 20)),
        )

    best: dict[str, float] = {}
    for label, _score, _ in shortlist:
        best[label] = max(best.get(label, 0.0), _score_pair(query, label))

    ranked = sorted(best.items(), key=lambda item: item[1], reverse=True)
    return ranked[:limit]


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
    del school  # school no longer scopes matching
    search_pool = _match_pool(grade=grade)
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

        ranked_labels = _rank_labels(normalized, labels, limit=12)

        # Rank with soft boosts; decide match status from raw similarity only.
        by_product: dict[int, tuple[Product, float, float]] = {}
        for label, base_score in ranked_labels:
            product = choices[label]
            boosted = (
                base_score
                + _department_boost(product)
                + _grade_boost(product, grade, query)
            )
            prev = by_product.get(product.id)
            if prev is None or boosted > prev[2]:
                by_product[product.id] = (product, base_score, boosted)

        ranked_products = sorted(
            by_product.values(),
            key=lambda item: (item[2], item[1]),
            reverse=True,
        )[:5]

        if not ranked_products:
            results.append(
                {
                    "query": query,
                    "author": author_hint,
                    "status": "unmatched",
                    "match": None,
                    "suggestions": [],
                    "message": "No close match — try editing the title.",
                }
            )
            continue

        top_product, top_score, _top_boosted = ranked_products[0]

        q_tokens = set(_significant_tokens(query))
        q_words = {t for t in q_tokens if not t.isdigit() and len(t) > 2}
        name_tokens = set(_significant_tokens(top_product.name))
        name_words = {t for t in name_tokens if not t.isdigit() and len(t) > 2}
        overlap_words = q_words & name_words

        def _strong_overlap(product_name: str) -> bool:
            p_words = {
                t
                for t in _significant_tokens(product_name)
                if not t.isdigit() and len(t) > 2
            }
            shared = q_words & p_words
            if not shared:
                return False
            distinctive_q = {w for w in q_words if w not in _GENERIC_SUBJECTS}
            distinctive_shared = shared & distinctive_q
            # If the query has a brand/series word (lifting, gateway, think…),
            # require at least one of those to appear on the product.
            if distinctive_q and not distinctive_shared:
                return False
            if distinctive_shared:
                return True
            # Generic-only queries: need multiple shared tokens
            return len(shared) >= 2

        strong = _strong_overlap(top_product.name)
        if top_score >= MATCH_THRESHOLD and not strong:
            top_score = min(top_score, SUGGEST_THRESHOLD - 0.1)

        query_grade_digit = _extract_grade_digit(grade, query)

        def _grade_compatible(product_name: str) -> bool:
            if not query_grade_digit:
                return True
            name_digits = re.findall(r"(?:^|\D)(\d{1,2})(?:\D|$)", product_name)
            if not name_digits:
                return True
            return query_grade_digit in name_digits

        suggestions = [
            _product_payload(product, score)
            for product, score, _boosted in ranked_products
            if score >= MIN_SUGGESTION_SCORE
            and _strong_overlap(product.name)
            and _grade_compatible(product.name)
        ]

        if top_score >= MATCH_THRESHOLD and strong:
            status = "matched"
            message = None
            match = _product_payload(top_product, top_score)
            if not any(s["product_id"] == match["product_id"] for s in suggestions):
                suggestions = [match, *suggestions][:5]
        elif (top_score >= SUGGEST_THRESHOLD and strong) or suggestions:
            status = "suggested"
            lead = suggestions[0]["name"] if suggestions else top_product.name
            message = f"Did you mean “{lead}”?"
            match = None
            if not suggestions and strong:
                suggestions = [_product_payload(top_product, top_score)]
        else:
            status = "unmatched"
            message = "No close match — try editing the title."
            match = None
            suggestions = []

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

    # Optional grade browse list (untagged textbooks won't appear — OK).
    catalog_products = list_school_grade_products(school=None, grade=grade) if grade else []

    return {
        "results": results,
        "catalog": [p.to_dict() for p in catalog_products],
        "school": None,
        "grade": grade,
        "catalog_count": len(catalog_products),
    }
