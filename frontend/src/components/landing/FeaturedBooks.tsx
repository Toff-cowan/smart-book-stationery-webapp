"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, fetchInventory } from "@/lib/api";
import { coverGradient, formatPrice } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";

export function FeaturedBooks() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchInventory({ per_page: 8 })
      .then((res) => {
        if (!cancelled) setItems(res.data.slice(0, 8));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load featured books.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="featured-section">
      <div className="featured-inner">
        <header className="featured-heading">
          <h2>Featured Products</h2>
        </header>

        {loading ? <p className="featured-status">Loading…</p> : null}
        {error ? <p className="featured-status error">{error}</p> : null}

        {!loading && !error ? (
          <div className="featured-grid">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/catalog/${item.id}`}
                className="featured-item"
              >
                <div
                  className="featured-cover"
                  style={
                    item.image_url
                      ? { backgroundImage: `url(${item.image_url})` }
                      : { backgroundImage: coverGradient(item.department) }
                  }
                >
                  {!item.image_url ? (
                    <span className="featured-cover-title">{item.name}</span>
                  ) : null}
                </div>
                <h3>{item.name}</h3>
                <p className="featured-sku">Item #: {item.id}</p>
                <p className="featured-price">{formatPrice(item.price)}</p>
              </Link>
            ))}
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <p className="featured-status">No products available yet.</p>
        ) : null}
      </div>
    </section>
  );
}
