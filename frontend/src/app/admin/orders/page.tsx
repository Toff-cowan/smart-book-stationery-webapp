"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { ApiError, fetchAdminOrders, type AdminOrder } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

const STATUS_OPTIONS = [
  "all",
  "submitted",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];

function OrdersTable({ orders }: { orders: AdminOrder[] }) {
  if (orders.length === 0) {
    return <p className="admin-empty">No orders match these filters.</p>;
  }

  return (
    <div className="admin-db-table-wrap">
      <table className="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Submitted</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>#{order.id}</td>
              <td>{order.customer?.name || "—"}</td>
              <td>
                {order.customer?.contact_email ||
                  order.contact_email ||
                  order.customer?.email ||
                  "—"}
              </td>
              <td>
                {order.customer?.contact_phone || order.contact_phone || "—"}
              </td>
              <td>
                {order.submitted_at
                  ? new Date(order.submitted_at).toLocaleString()
                  : "—"}
              </td>
              <td>{order.item_count ?? order.items?.length ?? 0}</td>
              <td>
                <Price value={order.grand_total} />
              </td>
              <td>
                <span className={`admin-status ${order.status}`}>
                  {order.status}
                </span>
              </td>
              <td>
                <Link href={`/admin/orders/${order.id}`}>Details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function matchesQuery(order: AdminOrder, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    String(order.id),
    order.status,
    order.title,
    order.notes,
    order.contact_email,
    order.contact_phone,
    order.customer?.name,
    order.customer?.email,
    order.customer?.contact_email,
    order.customer?.contact_phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function AdminOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminOrders(token)
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
  }, [token]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      return matchesQuery(order, deferredSearch);
    });
  }, [orders, status, deferredSearch]);

  function clearFilters() {
    setSearch("");
    setStatus("all");
  }

  return (
    <div className="admin-orders">
      <div className="admin-orders-toolbar">
        <label className="admin-orders-search">
          <span className="sr-only">Search orders</span>
          <input
            type="search"
            placeholder="Search order #, customer, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="admin-orders-filters">
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All statuses" : value}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        {!loading && !error ? (
          <p className="admin-orders-count">
            {filteredOrders.length === orders.length
              ? `${orders.length} order${orders.length === 1 ? "" : "s"}`
              : `${filteredOrders.length} of ${orders.length} orders`}
          </p>
        ) : null}
      </div>

      {loading ? <p className="catalog-status">Loading orders…</p> : null}
      {error ? <p className="msg error">{error}</p> : null}
      {!loading && !error ? <OrdersTable orders={filteredOrders} /> : null}
    </div>
  );
}
