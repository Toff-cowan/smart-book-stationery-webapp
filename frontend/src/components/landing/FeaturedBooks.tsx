"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, fetchInventory } from "@/lib/api";
import { coverGradient, mediaUrl } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { Price } from "@/components/Price";

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
          <h2>New Releases</h2>
        </header>

        {loading ? <p className="featured-status">Loading…</p> : null}
        {error ? <p className="featured-status error">{error}</p> : null}

        {!loading && !error ? (
          <div className="featured-grid">
            {items.map((item) => {
              const image = mediaUrl(item.image_url);
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
                {item.author ? (
                  <p className="featured-sku">{item.author}</p>
                ) : (
                  <p className="featured-sku">Item #: {item.id}</p>
                )}
                <p className="featured-price">
                  <Price value={item.price} />
                </p>
                <span className="featured-cart-btn">View item</span>
              </Link>
              );
            })}
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <p className="featured-status">No products available yet.</p>
        ) : null}
      </div>
    </section>
  );
}
