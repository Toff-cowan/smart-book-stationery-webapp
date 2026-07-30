"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  ApiError,
  fetchCart,
  removeCartItem,
  submitCartRequest,
  updateCartItem,
  type Cart,
  type CartItem,
} from "@/lib/api";
import { coverGradient, mediaUrl } from "@/lib/format";
import type { Department } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { Price } from "@/components/Price";
import { downloadQuoteTableImage } from "@/lib/quoteImage";

function CartItemRow({
  item,
  selected,
  onToggle,
  onQuantity,
  onDelete,
  busy,
}: {
  item: CartItem;
  selected: boolean;
  onToggle: () => void;
  onQuantity: (quantity: number) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const department = (item.department || "stationery") as Department;
  const inStock = (item.stock ?? 1) > 0;
  const image = mediaUrl(item.image_url);

  return (
    <article className={`amazon-cart-item${selected ? "" : " dimmed"}`}>
      <label className="amazon-cart-check">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${item.product_name}`}
        />
      </label>

      <Link href={`/catalog/${item.product_id}`} className="amazon-cart-thumb">
        <span
          className="amazon-cart-thumb-img"
          style={
            image
              ? { backgroundImage: `url(${image})` }
              : { backgroundImage: coverGradient(department) }
          }
        />
      </Link>

      <div className="amazon-cart-details">
        <Link href={`/catalog/${item.product_id}`} className="amazon-cart-title">
          {item.product_name}
        </Link>
        {item.author ? (
          <p className="amazon-cart-meta">by {item.author}</p>
        ) : null}
        <p className={inStock ? "amazon-cart-stock" : "amazon-cart-stock out"}>
          {inStock ? "In stock" : "Out of stock"}
        </p>
        <p className="amazon-cart-note">
          Pickup only — no online payment. The bookstore confirms availability.
        </p>

        <div className="amazon-cart-actions">
          <div className="amazon-qty">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={busy || item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
            >
              −
            </button>
            <span>{item.quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={busy}
              onClick={() => onQuantity(item.quantity + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="amazon-cart-link"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
          <Link href={`/catalog/${item.product_id}`} className="amazon-cart-link">
            View item
          </Link>
        </div>
      </div>

      <div className="amazon-cart-price">
        <span className="amazon-price-label">Price</span>
        <strong>
          <Price value={item.line_total} />
        </strong>
        <span className="amazon-unit">
          <Price value={item.unit_price} /> each
        </span>
      </div>
    </article>
  );
}

function CartInner() {
  const { token, ready, user } = useAuth();
  const { formatPrice } = useCurrency();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email && !contactEmail) {
      setContactEmail(user.email);
    }
    if (user?.phone && !contactPhone) {
      setContactPhone(user.phone);
    }
  }, [user?.email, user?.phone, contactEmail, contactPhone]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setCart(null);
      return;
    }

    let cancelled = false;
    fetchCart(token)
      .then((res) => {
        if (cancelled) return;
        setCart(res.data);
        setSelected(new Set(res.data.items.map((item) => item.id)));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load cart",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, ready]);

  const selectedItems = useMemo(() => {
    if (!cart) return [];
    return cart.items.filter((item) => selected.has(item.id));
  }, [cart, selected]);

  const selectedCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.line_total,
    0,
  );

  function downloadCartQuote() {
    if (selectedItems.length === 0) {
      setError("Select at least one item to download a quote.");
      return;
    }
    void downloadQuoteTableImage(
      selectedItems.map((item) => ({
        quantity: item.quantity,
        name: item.product_name,
        cost: item.unit_price,
      })),
      `bookstore-quote-${new Date().toISOString().slice(0, 10)}.png`,
    );
  }

  function toggleAll(checked: boolean) {
    if (!cart) return;
    setSelected(checked ? new Set(cart.items.map((item) => item.id)) : new Set());
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    if (!token || quantity < 1) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await updateCartItem(item.id, quantity, token);
      setCart(res.data);
      setSelected((prev) => {
        const next = new Set(prev);
        const ids = new Set(res.data.items.map((row) => row.id));
        for (const id of [...next]) {
          if (!ids.has(id)) next.delete(id);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update quantity");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(item: CartItem) {
    if (!token) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await removeCartItem(item.id, token);
      setCart(res.data);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove item");
    } finally {
      setBusyId(null);
    }
  }

  async function requestQuote() {
    if (!token || !cart || selectedItems.length === 0) return;
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    if (!email || !phone) {
      setError("Enter an email and phone number so the bookstore can notify you.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      // Remove unselected items before submitting so the request matches the sidebar
      const toRemove = cart.items.filter((item) => !selected.has(item.id));
      let latest = cart;
      for (const item of toRemove) {
        const res = await removeCartItem(item.id, token);
        latest = res.data;
      }
      setCart(latest);

      const res = await submitCartRequest(token, {
        fulfillment_type: "pickup",
        notes: notes.trim() || undefined,
        contact_email: email,
        contact_phone: phone,
      });
      setSuccess(res.message || "Request sent to the bookstore.");
      setCart({ ...res.data, items: [], grand_total: 0 });
      setSelected(new Set());
      setNotes("");
      setContactPhone("");
      // Refresh empty draft cart
      const refreshed = await fetchCart(token);
      setCart(refreshed.data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <p className="catalog-status">Loading…</p>;
  }

  if (!token) {
    return (
      <section className="amazon-cart">
        <h1>Shopping Cart</h1>
        <p className="amazon-cart-lead">
          <Link href="/login?next=/cart">Sign in</Link> to view your cart and
          request items from the bookstore.
        </p>
      </section>
    );
  }

  const allSelected =
    !!cart && cart.items.length > 0 && selected.size === cart.items.length;

  return (
    <section className="amazon-cart">
      {error ? <p className="msg error">{error}</p> : null}
      {success ? <p className="msg ok">{success}</p> : null}

      {!cart ? (
        <p className="catalog-status">Loading cart…</p>
      ) : cart.items.length === 0 && !success ? (
        <div className="amazon-cart-empty">
          <h1>Shopping Cart</h1>
          <p>
            Your cart is empty.{" "}
            <Link href="/catalog">Browse the catalog</Link>
          </p>
        </div>
      ) : cart.items.length === 0 && success ? (
        <div className="amazon-cart-empty">
          <h1>Request sent</h1>
          <p>{success}</p>
          <Link href="/catalog" className="amazon-continue">
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="amazon-cart-layout">
          <div className="amazon-cart-main">
            <header className="amazon-cart-header">
              <h1>Shopping Cart</h1>
              <button
                type="button"
                className="amazon-cart-link"
                onClick={() => toggleAll(!allSelected)}
              >
                {allSelected ? "Deselect all items" : "Select all items"}
              </button>
              <span className="amazon-cart-price-head">Price</span>
            </header>

            <div className="amazon-cart-list">
              {cart.items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  onToggle={() => toggleOne(item.id)}
                  onQuantity={(qty) => changeQuantity(item, qty)}
                  onDelete={() => deleteItem(item)}
                  busy={busyId === item.id || submitting}
                />
              ))}
            </div>

            <p className="amazon-cart-subtotal-row">
              Subtotal ({selectedCount} item{selectedCount === 1 ? "" : "s"}):{" "}
              <strong>{formatPrice(selectedTotal)}</strong>
            </p>
          </div>

          <aside className="amazon-cart-summary">
            <p className="amazon-cart-qualify">
              No online payment — request a quote from the bookstore.
            </p>
            <p className="amazon-cart-subtotal">
              Subtotal ({selectedCount} item{selectedCount === 1 ? "" : "s"}):{" "}
              <strong>{formatPrice(selectedTotal)}</strong>
            </p>
            <p className="amazon-cart-summary-copy">
              We email the bookstore your list. They reply with what is in
              stock, the total cost, and when your package will be ready for
              pickup.
            </p>

            <label className="amazon-cart-notes">
              <span>Email for updates</span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="amazon-cart-notes">
              <span>Phone number</span>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. 876-555-1234"
                autoComplete="tel"
                required
              />
            </label>

            <label className="amazon-cart-notes">
              <span>Notes for the bookstore (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="School name, student grade, preferred pickup day…"
              />
            </label>

            <button
              type="button"
              className="amazon-checkout-btn"
              disabled={
                submitting ||
                selectedItems.length === 0 ||
                !contactEmail.trim() ||
                !contactPhone.trim()
              }
              onClick={requestQuote}
            >
              {submitting ? "Sending…" : "Request quote from bookstore"}
            </button>

            <button
              type="button"
              className="btn-secondary amazon-quote-download"
              disabled={selectedItems.length === 0}
              onClick={downloadCartQuote}
            >
              Download quote image
            </button>

            <Link href="/catalog" className="amazon-continue">
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <CartInner />
    </Suspense>
  );
}
