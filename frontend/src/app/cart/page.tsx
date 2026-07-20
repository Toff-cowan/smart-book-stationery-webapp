"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

import { ApiError, API_BASE } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

type CartItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Cart = {
  id: number;
  grand_total: number;
  items: CartItem[];
};

function CartInner() {
  const { token, ready } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setCart(null);
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE}/api/cart`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new ApiError(body.message || "Failed to load cart", res.status);
        }
        if (!cancelled) setCart(body.data as Cart);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load cart");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, ready]);

  if (!ready) {
    return <p className="catalog-status">Loading…</p>;
  }

  if (!token) {
    return (
      <section className="cart-panel">
        <h1>Your cart</h1>
        <p>
          <Link href="/login?next=/cart">Sign in</Link> to view your cart.
        </p>
      </section>
    );
  }

  return (
    <section className="cart-panel">
      <h1>Your cart</h1>
      {error ? <p className="msg error">{error}</p> : null}
      {!cart ? (
        <p className="catalog-status">Loading cart…</p>
      ) : cart.items.length === 0 ? (
        <p className="empty">
          Cart is empty. <Link href="/catalog">Browse the catalog</Link>
        </p>
      ) : (
        <>
          <ul className="cart-list">
            {cart.items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.product_name}</strong>
                  <span>
                    {item.quantity} × {formatPrice(item.unit_price)}
                  </span>
                </div>
                <span>{formatPrice(item.line_total)}</span>
              </li>
            ))}
          </ul>
          <p className="cart-total">
            Total: <strong>{formatPrice(cart.grand_total)}</strong>
          </p>
          <Link href="/catalog" className="back-link">
            ← Continue browsing
          </Link>
        </>
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
