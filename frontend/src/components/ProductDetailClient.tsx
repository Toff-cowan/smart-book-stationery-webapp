"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import { AddToCartButton } from "@/components/AddToCartButton";
import { Price } from "@/components/Price";
import { StarRating } from "@/components/StarRating";
import {
  ApiError,
  deleteProductRating,
  fetchInventoryItem,
  fetchProductRatings,
  submitProductRating,
} from "@/lib/api";
import { coverGradient, mediaUrl } from "@/lib/format";
import type { InventoryItem, ProductRating } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

type ProductDetailClientProps = {
  id: number;
};

function departmentLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SpecRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </tr>
  );
}

export function ProductDetailClient({ id }: ProductDetailClientProps) {
  const { token, user, ready } = useAuth();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [ratings, setRatings] = useState<ProductRating[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewInfo, setReviewInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchInventoryItem(id), fetchProductRatings(id)])
      .then(([itemRes, ratingsRes]) => {
        if (cancelled) return;
        setItem(itemRes.data);
        setRatings(ratingsRes.data);
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

  useEffect(() => {
    if (!user || !ratings.length) return;
    const mine = ratings.find((r) => r.user_id === user.id);
    if (mine) {
      setStars(mine.stars);
      setComment(mine.comment ?? "");
    }
  }, [ratings, user]);

  async function onSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!token || !item) return;
    setReviewBusy(true);
    setReviewError(null);
    setReviewInfo(null);
    try {
      const res = await submitProductRating(
        item.id,
        { stars, comment: comment.trim() || null },
        token,
      );
      setItem(res.product);
      const list = await fetchProductRatings(item.id);
      setRatings(list.data);
      setReviewInfo(res.message || "Review saved.");
    } catch (err) {
      setReviewError(
        err instanceof ApiError ? err.message : "Could not save review",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  async function onRemoveReview() {
    if (!token || !item) return;
    setReviewBusy(true);
    setReviewError(null);
    setReviewInfo(null);
    try {
      const res = await deleteProductRating(item.id, token);
      setItem(res.product);
      const list = await fetchProductRatings(item.id);
      setRatings(list.data);
      setStars(5);
      setComment("");
      setReviewInfo("Your review was removed.");
    } catch (err) {
      setReviewError(
        err instanceof ApiError ? err.message : "Could not remove review",
      );
    } finally {
      setReviewBusy(false);
    }
  }

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
  const myReview = user
    ? ratings.find((r) => r.user_id === user.id)
    : undefined;

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

      <section className="detail-section" aria-labelledby="product-details-heading">
        <h2 id="product-details-heading">Product details</h2>
        <div className="detail-specs-wrap">
          <table className="detail-specs">
            <tbody>
              <SpecRow label="Author" value={item.author} />
              <SpecRow label="Publisher" value={item.publisher} />
              <SpecRow label="ISBN" value={item.isbn} />
              <SpecRow label="Department" value={departmentLabel(item.department)} />
              <SpecRow
                label="Grades"
                value={
                  item.grades?.length ? item.grades.join(", ") : null
                }
              />
              <SpecRow
                label="Availability"
                value={
                  item.quantity > 0
                    ? `${item.quantity} in stock`
                    : "Out of stock"
                }
              />
              <tr>
                <th scope="row">Price</th>
                <td>
                  <Price value={item.price} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section" aria-labelledby="product-reviews-heading">
        <div className="detail-reviews-head">
          <h2 id="product-reviews-heading">Customer reviews</h2>
          <StarRating
            value={item.rating_stars}
            count={item.rating_count}
            size="md"
          />
        </div>

        {!ready ? (
          <p className="detail-reviews-note">Checking account…</p>
        ) : token ? (
          <form className="detail-review-form" onSubmit={onSubmitReview}>
            <h3>{myReview ? "Update your review" : "Write a review"}</h3>
            {reviewError ? <p className="msg error">{reviewError}</p> : null}
            {reviewInfo ? <p className="msg ok">{reviewInfo}</p> : null}
            <fieldset className="detail-star-picker">
              <legend>Your rating</legend>
              <div className="detail-star-buttons">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n <= stars ? "star-pick on" : "star-pick"}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={n === stars}
                    onClick={() => setStars(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="detail-review-comment">
              <span>Comments (optional)</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you think of this item?"
              />
            </label>
            <div className="detail-review-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={reviewBusy}
              >
                {reviewBusy
                  ? "Saving…"
                  : myReview
                    ? "Update review"
                    : "Submit review"}
              </button>
              {myReview ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={reviewBusy}
                  onClick={() => void onRemoveReview()}
                >
                  Remove review
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="detail-reviews-note">
            <Link href={`/login?next=${encodeURIComponent(`/catalog/${item.id}`)}`}>
              Sign in
            </Link>{" "}
            to leave a review.
          </p>
        )}

        {ratings.length === 0 ? (
          <p className="detail-reviews-empty">No reviews yet.</p>
        ) : (
          <ul className="detail-reviews-list">
            {ratings.map((rating) => (
              <li key={rating.id} className="detail-review-card">
                <div className="detail-review-top">
                  <strong>{rating.user_name}</strong>
                  <StarRating value={rating.stars} size="sm" />
                </div>
                {rating.comment ? (
                  <p className="detail-review-body">{rating.comment}</p>
                ) : (
                  <p className="detail-review-body muted">Rated this product.</p>
                )}
                {rating.updated_at ? (
                  <time dateTime={rating.updated_at}>
                    {new Date(rating.updated_at).toLocaleDateString()}
                  </time>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
