"""Sync a QB POS inventory .xls/.xlsx export into products.

Uses existing product columns only (no schema changes):
  Item Name -> name
  Item Description -> description
  Regular Price -> price
  UPC -> isbn
  Vendor Name -> publisher
  Department Name -> department/category_id

Matches existing rows by UPC/isbn or exact name (case-insensitive).
Updates matches; inserts new items. Stock is left unchanged on updates
(export has no qty); new rows get stock=0.

Pricing: Regular Price is stored as-is in JMD (store base currency).
Vendor Name maps to products.vendor (not author/publisher).

Usage:
  python sync_qb_inventory.py "C:\\path\\to\\QB POS Inventory Items Export.xls"
"""

from __future__ import annotations

import math
import os
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

DEPT_MAP = {
    "textbook": "textbooks",
    "stationery": "stationery",
    "stationary": "stationery",
    "accessories": "gifts",
    "bible": "gifts",
    "dictionary": "gifts",
    "rubber band": "stationery",
    "system": "stationery",
}
CAT = {"textbooks": 1, "stationery": 2, "gifts": 3}


def clean_upc(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, float):
        text = f"{value:.0f}"
    else:
        text = str(value).strip()
        if text.endswith(".0"):
            text = text[:-2]
        text = re.sub(r"\D", "", text) or text
    text = text.strip()
    if not text or text == "0":
        return None
    return text[:32]


def clean_price(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")
    if amount < 0:
        return Decimal("0.00")
    return amount


def clean_text(value, max_len=None):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = " ".join(str(value).split())
    if not text or text.lower() == "nan":
        return None
    if max_len:
        text = text[:max_len]
    return text


def main():
    export = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else r"c:\Users\cowan\Documents\QB POS Inventory Items Export.xls"
    )
    if not export.exists():
        raise SystemExit(f"Export not found: {export}")

    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("DATABASE_URL missing in backend/.env")

    df = pd.read_excel(export, engine="openpyxl")
    rows = []
    seen = set()
    skipped = 0
    for _, row in df.iterrows():
        name = clean_text(row.get("Item Name"), 200)
        if not name:
            skipped += 1
            continue
        key = name.casefold()
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        department = DEPT_MAP.get(
            str(row.get("Department Name") or "").strip().casefold(),
            "stationery",
        )
        rows.append(
            (
                name,
                clean_text(row.get("Item Description")),
                clean_price(row.get("Regular Price")),
                clean_upc(row.get("UPC")),
                clean_text(row.get("Vendor Name"), 200),
                department,
                CAT[department],
            )
        )

    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM products")
            before = cur.fetchone()[0]
            updated = 0
            inserted = 0
            for name, desc, price, isbn, vendor, department, category_id in rows:
                cur.execute(
                    """
                    WITH matched AS (
                      SELECT id
                      FROM products
                      WHERE (%s IS NOT NULL AND isbn = %s)
                         OR lower(btrim(name)) = lower(btrim(%s))
                      ORDER BY id
                      LIMIT 1
                    ),
                    updated AS (
                      UPDATE products p
                      SET
                        name = %s,
                        description = COALESCE(%s, p.description),
                        price = %s,
                        department = %s,
                        category_id = %s,
                        vendor = COALESCE(%s, p.vendor),
                        isbn = COALESCE(%s, p.isbn),
                        is_active = TRUE,
                        updated_at = NOW()
                      FROM matched m
                      WHERE p.id = m.id
                      RETURNING p.id
                    )
                    INSERT INTO products (
                      name, description, price, stock, department, vendor, isbn,
                      category_id, is_active, created_at, updated_at
                    )
                    SELECT
                      %s, %s, %s, 0, %s, %s, %s,
                      %s, TRUE, NOW(), NOW()
                    WHERE NOT EXISTS (SELECT 1 FROM updated)
                    RETURNING id
                    """,
                    (
                        isbn,
                        isbn,
                        name,
                        name,
                        desc,
                        price,
                        department,
                        category_id,
                        vendor,
                        isbn,
                        name,
                        desc,
                        price,
                        department,
                        vendor,
                        isbn,
                        category_id,
                    ),
                )
                result = cur.fetchone()
                if result:
                    inserted += 1
                else:
                    updated += 1

            cur.execute("SELECT COUNT(*) FROM products")
            after = cur.fetchone()[0]
        conn.commit()
        print(
            f"before={before} after={after} updated={updated} "
            f"inserted={inserted} skipped={skipped}"
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
