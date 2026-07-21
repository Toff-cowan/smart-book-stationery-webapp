"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, fetchAdminOrders, type AdminOrder } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

type Tab = "outstanding" | "completed" | "cancelled";


function OrdersTable({ orders }: { orders: AdminOrder[] }) {
  if (orders.length === 0) {
    return <p className="admin-empty">No orders in this list.</p>;
  }

  return (
    <table className="admin-table">
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
  );
}

export default function AdminOrdersPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("outstanding");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminOrders(token, { bucket: tab })
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
  }, [token, tab]);

  return (
    <div className="admin-orders">
      <div className="admin-tabs">
        <button
          type="button"
          className={tab === "outstanding" ? "active" : ""}
          onClick={() => setTab("outstanding")}
        >
          Outstanding
        </button>
        <button
          type="button"
          className={tab === "completed" ? "active" : ""}
          onClick={() => setTab("completed")}
        >
          Completed
        </button>
        <button
          type="button"
          className={tab === "cancelled" ? "active" : ""}
          onClick={() => setTab("cancelled")}
        >
          Cancelled
        </button>
      </div>

      {loading ? <p className="catalog-status">Loading orders…</p> : null}
      {error ? <p className="msg error">{error}</p> : null}
      {!loading && !error ? <OrdersTable orders={orders} /> : null}
    </div>
  );
}
