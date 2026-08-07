"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, fetchRecommended } from "@/lib/api";
import { coverGradient, mediaUrl } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { Price } from "@/components/Price";

export function Recommended() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecommended(12)
      .then((res) => {
        if (!cancelled) setItems(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load recommended items.",
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
    <section className="featured-section recommended-section">
      <div className="featured-inner">
        <header className="featured-heading recommended-heading">
          <h2>Recommended</h2>
          <p className="featured-sub">
            Textbooks customers choose most often
          </p>
        </header>

        {loading ? <p className="featured-status">Loading…</p> : null}
        {error ? <p className="featured-status error">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className="featured-status">No recommendations yet.</p>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="featured-grid">
            {items.map((item) => {
              const image = mediaUrl(item.image_url);
              const sold = item.units_sold ?? 0;
              return (
              <Link
                key={item.id}
                href={`/catalog/${item.id}`}
                className="featured-item"
              >
                <div
                  className="featured-cover"
                  style={
                    image
                      ? { backgroundImage: `url(${image})` }
                      : { backgroundImage: coverGradient(item.department) }
                  }
                >
                  {!image ? (
                    <span className="featured-cover-title">{item.name}</span>
                  ) : null}
                </div>
                <h3>{item.name}</h3>
                <p className="featured-sku">
                  {sold > 0
                    ? `${sold} ordered`
                    : item.rating_stars != null
                      ? `${item.rating_stars.toFixed(1)} ★`
                      : "Popular pick"}
                  {item.author ? ` · ${item.author}` : ""}
                </p>
                <p className="featured-price">
                  <Price value={item.price} />
                </p>
                <span className="featured-cart-btn">View item</span>
              </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
