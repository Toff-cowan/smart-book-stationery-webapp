"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, fetchBestsellers } from "@/lib/api";
import { coverGradient } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { Price } from "@/components/Price";

export function BestSellers() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchBestsellers(8)
      .then((res) => {
        if (!cancelled) setItems(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load best sellers.",
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
    <section className="featured-section bestsellers-section">
      <div className="featured-inner">
        <header className="featured-heading bestsellers-heading">
          <h2>Best Sellers</h2>
        </header>

        {loading ? <p className="featured-status">Loading…</p> : null}
        {error ? <p className="featured-status error">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className="featured-status">
            No completed orders yet — best sellers will appear here.
          </p>
        ) : null}

        {!loading && !error && items.length > 0 ? (
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
                <p className="featured-sku">
                  {item.units_sold ?? 0} sold
                  {item.author ? ` · ${item.author}` : ""}
                </p>
                <p className="featured-price">
                  <Price value={item.price} />
                </p>
                <span className="featured-cart-btn">View item</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
