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
# Keep subject words (writing/reading/comprehension) — stripping them collapses
# titles like "Reading & Comprehension K2" to just "k2" and false-matches.
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
        "pack",
        "let",
        "s",  # from "Let's" → "let s"
        "lets",
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
    (r"\bcarlong integrated assessment papers\b", "ciap"),
    (r"\bciap\b", "ciap"),
    (r"\bworkbook(s)?\b", "wkbk"),
    (r"\bwkbk\b", "wkbk"),
    (r"\bgrade\b", "gr"),
    (r"\bgr\b", "gr"),
    (r"\bform\b", "form"),
    (r"\bintegrated\b", "integ"),
    (r"\binteg\b", "integ"),
    # Common short form: "int reader" → integrated reader
    (r"\bint\b", "integ"),
    (r"\bmathematics\b", "maths"),
    (r"\bmath\b", "maths"),
    (r"\blanguage\b", "lang"),
    (r"\blang\b", "lang"),
    (r"\breaders?\b", "reader"),
    (r"\brdr\b", "reader"),
    (r"\bsocial studies\b", "social studies"),
    (r"\bss\b", "social studies"),
    (r"\bperformance task(s)?\b", "performance task"),
    # Kindergarten levels (Jamaican early childhood): K1 / K2
    (r"\bk\s*[-]?\s*([12])\b", r"k\1"),
    (r"\bkindergarten\s*([12])\b", r"k\1"),
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


def _exactish_title(query: str, product_name: str) -> bool:
    """True when the scanned title is essentially the same catalog name."""
    nq = normalize_query(query)
    nn = normalize_query(product_name)
    if nq and nq == nn:
        return True
    cq = _compact_query(query)
    cn = _compact_query(product_name)
    if cq and cq == cn:
        return True
    # High literal similarity after normalization (near-exact OCR).
    if nq and nn and fuzz.ratio(nq, nn) >= 96:
        return True
    return False


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


def _is_usable_compact_label(compact: str) -> bool:
    """Reject ultra-short labels (e.g. lone 'k2') that inflate subset scores."""
    tokens = compact.split()
    if len(tokens) >= 2:
        return True
    if len(tokens) == 1 and len(tokens[0]) >= 6 and not re.fullmatch(r"k[12]", tokens[0]):
        return True
    return False


def _product_choices(products: list[Product]) -> dict[str, Product]:
    """Map normalized searchable labels → product."""
    choices: dict[str, Product] = {}
    for product in products:
        labels = [product.name]
        compact = _compact_query(product.name)
        if compact and compact != normalize_query(product.name) and _is_usable_compact_label(compact):
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
            if (
                compact_key
                and compact_key not in choices
                and _is_usable_compact_label(compact_key)
            ):
                choices[compact_key] = product
    return choices


def _department_boost(product: Product) -> float:
    if product.department == "textbooks":
        return 8.0
    if product.department == "stationery":
        return -12.0
    return 0.0


def _extract_k_level(*texts: str | None) -> str | None:
    """Return 'k1' / 'k2' when present (kindergarten early-childhood levels)."""
    for text in texts:
        if not text:
            continue
        normalized = normalize_query(text)
        marked = re.search(r"\bk([12])\b", normalized)
        if marked:
            return f"k{marked.group(1)}"
    return None


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
    name = product.name.casefold()
    product_grades = [g.casefold() for g in product.get_grades()]
    boost = 0.0

    k_level = _extract_k_level(grade, query)
    if k_level:
        if re.search(rf"\b{re.escape(k_level)}\b", normalize_query(product.name)):
            boost += 12.0
        elif re.search(r"\bk[12]\b", normalize_query(product.name)):
            boost -= 10.0
        # "Writing Practice 2A" is not K2 — soft penalty when query wants K-level.
        elif re.search(r"(?:^|\D)(\d{1,2})[a-z]?\b", name) and "k1" not in name and "k2" not in name:
            boost -= 6.0

    digit = _extract_grade_digit(grade, query)
    if not digit and not k_level:
        return boost
    if not digit:
        return boost

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
    label_tokens = label.split()
    query_tokens = compact_q.split()

    # Ultra-short labels are subset traps for token_set / partial (e.g. "k2").
    if len(label_tokens) <= 1 and len(query_tokens) >= 2:
        return float(fuzz.WRatio(compact_q, label))

    scores = [
        fuzz.WRatio(query, label),
        fuzz.token_set_ratio(query, label),
        fuzz.partial_ratio(query, label),
        fuzz.WRatio(compact_q, label),
        fuzz.token_set_ratio(compact_q, label),
        fuzz.partial_ratio(compact_q, label),
        fuzz.token_sort_ratio(compact_q, label),
    ]
    score = float(max(scores))

    # Cap subset inflation when the label is much shorter than the query.
    if len(label) < max(8, int(len(compact_q) * 0.4)):
        score = min(score, float(fuzz.token_sort_ratio(compact_q, label)) + 8.0)

    return score


def _rank_labels(query: str, labels: list[str], *, limit: int = 8) -> list[tuple[str, float]]:
    if not labels:
        return []
    # First pass: cheap WRatio shortlist from full label set
    shortlist = process.extract(
        query,
        labels,
        scorer=fuzz.WRatio,
        limit=min(60, max(limit * 8, 24)),
    )
    compact = _compact_query(query)
    if compact and compact != query:
        shortlist += process.extract(
            compact,
            labels,
            scorer=fuzz.token_set_ratio,
            limit=min(60, max(limit * 8, 24)),
        )
        shortlist += process.extract(
            compact,
            labels,
            scorer=fuzz.token_sort_ratio,
            limit=min(40, max(limit * 5, 16)),
        )

    best: dict[str, float] = {}
    for label, _score, _ in shortlist:
        best[label] = max(best.get(label, 0.0), _score_pair(query, label))

    ranked = sorted(best.items(), key=lambda item: item[1], reverse=True)
    return ranked[:limit]


def _author_boost(product: Product, author_hint: str | None) -> float:
    """Soft boost when catalog author overlaps OCR author hint."""
    if not author_hint or not product.author:
        return 0.0
    hint = {
        t
        for t in _significant_tokens(author_hint)
        if not t.isdigit() and len(t) > 2
    }
    catalog = {
        t
        for t in _significant_tokens(product.author)
        if not t.isdigit() and len(t) > 2
    }
    if not hint or not catalog:
        return 0.0
    shared = hint & catalog
    if not shared:
        return 0.0
    # Surname-quality overlap (Richards, Mordecai, …)
    return min(18.0, 6.0 * len(shared))


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

        # Rank on the TITLE only. Appending OCR author names (often 2–3 people)
        # dilutes fuzzy scores and surfaces unrelated "English" books at ~86%.
        title_normalized = normalize_query(query)
        if not title_normalized:
            continue

        if not labels and not search_pool:
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

        ranked_labels = _rank_labels(title_normalized, labels, limit=20)

        # Rank with soft boosts; decide match status from raw similarity only.
        by_product: dict[int, tuple[Product, float, float]] = {}
        for label, base_score in ranked_labels:
            product = choices[label]
            boosted = (
                base_score
                + _department_boost(product)
                + _grade_boost(product, grade, query)
                + _author_boost(product, author_hint)
            )
            prev = by_product.get(product.id)
            if prev is None or boosted > prev[2]:
                by_product[product.id] = (product, base_score, boosted)

        ranked_products = sorted(
            by_product.values(),
            key=lambda item: (item[2], item[1]),
            reverse=True,
        )[:5]

        # Prefer an exact / near-exact TITLE over a fuzzy high score.
        # Scan the full pool — shortlist can miss near-duplicates like
        # "New Junior English Revised" → "Junior English Revised".
        exact_hit = None
        for product in search_pool:
            if _exactish_title(query, product.name):
                exact_hit = product
                break
        if exact_hit is not None:
            prev = by_product.get(exact_hit.id)
            base = max(prev[1] if prev else 0.0, 100.0)
            boosted = max(prev[2] if prev else 0.0, 100.0) + _author_boost(
                exact_hit, author_hint
            )
            ranked_products = [
                (exact_hit, base, boosted),
                *[row for row in ranked_products if row[0].id != exact_hit.id],
            ][:5]
            by_product[exact_hit.id] = (exact_hit, base, boosted)

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
            if distinctive_q and not distinctive_shared:
                return False
            if distinctive_shared:
                return True
            return len(shared) >= 2

        strong = _strong_overlap(top_product.name)
        exactish = _exactish_title(query, top_product.name)
        effective_score = top_score
        if top_score >= MATCH_THRESHOLD and not strong and not exactish:
            effective_score = min(top_score, SUGGEST_THRESHOLD - 0.1)

        query_grade_digit = _extract_grade_digit(grade, query)
        query_k_level = _extract_k_level(grade, query)

        def _grade_compatible(product_name: str) -> bool:
            if query_k_level:
                pname = normalize_query(product_name)
                if re.search(r"\bk[12]\b", pname):
                    return query_k_level in pname
            if not query_grade_digit:
                return True
            name_digits = re.findall(r"(?:^|\D)(\d{1,2})(?:\D|$)", product_name)
            if not name_digits:
                return True
            return query_grade_digit in name_digits

        # Offer pickable options only when we are not auto-matching.
        preferred = [
            _product_payload(product, score)
            for product, score, _boosted in ranked_products
            if score >= 45
            and _grade_compatible(product.name)
            and (_strong_overlap(product.name) or score >= SUGGEST_THRESHOLD)
        ]
        fallback = [
            _product_payload(product, score)
            for product, score, _boosted in ranked_products
            if score >= 40
        ]
        seen_ids: set[int] = set()
        suggestions = []
        for item in preferred + fallback:
            pid = item["product_id"]
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            suggestions.append(item)
            if len(suggestions) >= 5:
                break

        # Catalog keyword search fallback when fuzzy suggestions miss the book
        # (e.g. OCR noise). Closest ILIKE hits by title tokens.
        if len(suggestions) < 3 or not any(
            _strong_overlap(s["name"]) for s in suggestions
        ):
            search_tokens = [
                t
                for t in _significant_tokens(query)
                if not t.isdigit() and len(t) > 2 and t not in _GENERIC_SUBJECTS
            ]
            if not search_tokens:
                search_tokens = [
                    t
                    for t in _significant_tokens(query)
                    if not t.isdigit() and len(t) > 2
                ][:3]
            if search_tokens:
                from sqlalchemy import or_

                filters = [Product.name.ilike(f"%{tok}%") for tok in search_tokens[:4]]
                catalog_hits = (
                    Product.query.filter(Product.is_active.is_(True), or_(*filters))
                    .order_by(Product.name.asc())
                    .limit(24)
                    .all()
                )
                scored_hits = sorted(
                    (
                        (
                            product,
                            _score_pair(title_normalized, normalize_query(product.name)),
                        )
                        for product in catalog_hits
                        if product.id not in seen_ids
                        and _grade_compatible(product.name)
                    ),
                    key=lambda row: row[1],
                    reverse=True,
                )
                for product, score in scored_hits:
                    if score < 40:
                        continue
                    payload = _product_payload(product, score)
                    seen_ids.add(product.id)
                    suggestions.append(payload)
                    if len(suggestions) >= 5:
                        break

        if exactish or (effective_score >= MATCH_THRESHOLD and strong):
            status = "matched"
            message = None
            match = _product_payload(top_product, max(top_score, 100.0) if exactish else top_score)
            # Confident / exact match — no alternative list needed.
            suggestions = []
        elif suggestions:
            status = "suggested" if (effective_score >= SUGGEST_THRESHOLD and strong) else "unmatched"
            message = "Pick the correct book from the options below."
            match = None
        else:
            status = "unmatched"
            message = "No close match — try editing the title, then search again."
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
