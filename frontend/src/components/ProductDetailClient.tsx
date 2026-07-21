"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { AddToCartButton } from "@/components/AddToCartButton";
import { Price } from "@/components/Price";
import { StarRating } from "@/components/StarRating";
import { ApiError, fetchInventoryItem } from "@/lib/api";
import { coverGradient, mediaUrl } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";

type ProductDetailClientProps = {
  id: number;
};

export function ProductDetailClient({ id }: ProductDetailClientProps) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchInventoryItem(id)
      .then((res) => {
        if (!cancelled) setItem(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load this item",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="catalog-status">Loading…</p>;
  }

  if (error || !item) {
    return (
      <div className="detail-empty">
        <p>{error || "Item not found"}</p>
        <Link href="/catalog">Back to catalog</Link>
      </div>
    );
  }

  const image = mediaUrl(item.image_url);

  return (
    <article className="product-detail">
      <Link href="/catalog" className="back-link">
        ← Catalog
      </Link>

      <div className="detail-layout">
        <div
          className="detail-cover"
          style={
            image
              ? { backgroundImage: `url(${image})` }
              : { backgroundImage: coverGradient(item.department) }
          }
          role="img"
          aria-label={item.name}
        >
          {!image ? (
            <span className="cover-title large">{item.name}</span>
          ) : null}
        </div>

        <div className="detail-info">
          <h1>{item.name}</h1>
          {item.author ? <p className="author">by {item.author}</p> : null}
          {item.publisher ? (
            <p className="publisher">Publisher: {item.publisher}</p>
          ) : null}

          <div className="detail-stats">
            <StarRating
              value={item.rating_stars}
              count={item.rating_count}
              size="md"
            />
            <p className="detail-price">
              <Price value={item.price} />
            </p>
          </div>

          {item.description ? (
            <p className="description">{item.description}</p>
          ) : null}

          <p className="stock">
            {item.quantity > 0
              ? `${item.quantity} in stock`
              : "Currently unavailable"}
          </p>

          <AddToCartButton
            productId={item.id}
            disabled={item.quantity <= 0}
          />
        </div>
      </div>
    </article>
  );
}
