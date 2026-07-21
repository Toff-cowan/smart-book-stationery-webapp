"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  ApiError,
  deleteCustomerOrder,
  fetchCustomerOrders,
  type CustomerOrder,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

function canDelete(status: string) {
  return status !== "cancelled" && status !== "completed";
}

function OrdersInner() {
  const { token, ready } = useAuth();
  const searchParams = useSearchParams();
  const highlightRaw = searchParams.get("order");
  const highlightId = highlightRaw ? Number(highlightRaw) : null;
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCustomerOrders(token)
      .then((res) => {
        if (!cancelled) setOrders(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load orders",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  useEffect(() => {
    if (loading || !highlightId || Number.isNaN(highlightId)) return;
    const el = document.getElementById(`order-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, highlightId, orders]);

  async function onDelete(order: CustomerOrder) {
    if (!token) return;
    const ok = window.confirm(
      `Delete order #${order.id}? The bookstore will be notified.`,
    );
    if (!ok) return;

    setBusyId(order.id);
    setError(null);
    setInfo(null);
    try {
      const res = await deleteCustomerOrder(order.id, token);
      setOrders((prev) =>
        prev.map((row) => (row.id === order.id ? res.data : row)),
      );
      setInfo(res.message || "Order deleted. The bookstore was notified.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete order",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || loading) {
    return <p className="catalog-status">Loading orders…</p>;
  }

  if (!token) {
    const next =
      highlightId && !Number.isNaN(highlightId)
        ? `/orders?order=${highlightId}`
        : "/orders";
    return (
      <section className="customer-orders">
        <h1>My orders</h1>
        <p className="customer-orders-lead">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>{" "}
          to view and manage your bookstore requests.
        </p>
      </section>
    );
  }

  return (
    <section className="customer-orders">
      <header className="customer-orders-head">
        <h1>My orders</h1>
        <p>
          Track quote requests you sent to Smart Books Stationery and Supplies
          Ltd. Deleting an order notifies the staff dashboard.
        </p>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      {orders.length === 0 ? (
        <p className="customer-orders-empty">
          No orders yet.{" "}
          <Link href="/catalog">Browse the catalog</Link> and request a quote
          from your cart.
        </p>
      ) : (
        <ul className="customer-orders-list">
          {orders.map((order) => {
            const itemCount = order.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            );
            const highlighted =
              highlightId != null &&
              !Number.isNaN(highlightId) &&
              order.id === highlightId;
            return (
              <li
                key={order.id}
                id={`order-${order.id}`}
                className={
                  highlighted
                    ? "customer-order-card highlighted"
                    : "customer-order-card"
                }
              >
                <div className="customer-order-top">
                  <div>
                    <h2>Order #{order.id}</h2>
                    <p className="customer-order-meta">
                      {order.submitted_at
                        ? new Date(order.submitted_at).toLocaleString()
                        : "—"}
                      {" · "}
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                      {" · "}
                      <Price value={order.grand_total} />
                    </p>
                  </div>
                  <span className={`admin-status ${order.status}`}>
                    {order.status}
                  </span>
                </div>

                <ul className="customer-order-items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.product_name} × {item.quantity}
                    </li>
                  ))}
                </ul>

                {order.contact_email || order.contact_phone ? (
                  <p className="customer-order-contact">
                    Notify: {order.contact_email || "—"}
                    {order.contact_phone ? ` · ${order.contact_phone}` : ""}
                  </p>
                ) : null}

                {canDelete(order.status) ? (
                  <button
                    type="button"
                    className="customer-order-delete"
                    disabled={busyId === order.id}
                    onClick={() => onDelete(order)}
                  >
                    {busyId === order.id ? "Deleting…" : "Delete order"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading orders…</p>}>
      <OrdersInner />
    </Suspense>
  );
}
