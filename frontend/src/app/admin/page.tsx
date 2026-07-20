"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchAdminOrders,
  fetchAdminSales,
  fetchAdminSummary,
  type AdminOrder,
  type AdminSummary,
  type SalesPoint,
} from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

function SalesChart({ points }: { points: SalesPoint[] }) {
  const max = Math.max(...points.map((p) => p.revenue), 1);

  return (
    <div className="admin-chart" role="img" aria-label="Sales over time">
      <div className="admin-chart-bars">
        {points.map((point) => {
          const height = Math.max((point.revenue / max) * 100, point.revenue > 0 ? 4 : 0);
          return (
            <div key={point.date} className="admin-chart-col" title={`${point.date}: ${formatPrice(point.revenue)}`}>
              <div className="admin-chart-bar" style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
      <div className="admin-chart-labels">
        <span>{points[0]?.date?.slice(5) || ""}</span>
        <span>Sales (last {points.length} days)</span>
        <span>{points[points.length - 1]?.date?.slice(5) || ""}</span>
      </div>
    </div>
  );
}

function OrdersMiniTable({
  title,
  orders,
}: {
  title: string;
  orders: AdminOrder[];
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2>{title}</h2>
        <Link href="/admin/orders">View all</Link>
      </div>
      {orders.length === 0 ? (
        <p className="admin-empty">No orders yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/admin/orders/${order.id}`}>#{order.id}</Link>
                </td>
                <td>{order.customer?.name || "—"}</td>
                <td>
                  <span className={`admin-status ${order.status}`}>
                    {order.status}
                  </span>
                </td>
                <td>{formatPrice(order.grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [sales, setSales] = useState<SalesPoint[]>([]);
  const [outstanding, setOutstanding] = useState<AdminOrder[]>([]);
  const [completed, setCompleted] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAdminSummary(token),
      fetchAdminSales(token, 30),
      fetchAdminOrders(token, { bucket: "outstanding" }),
      fetchAdminOrders(token, { bucket: "completed" }),
    ])
      .then(([sum, salesRes, outRes, doneRes]) => {
        if (cancelled) return;
        setSummary(sum.data);
        setSales(salesRes.data);
        setOutstanding(outRes.data.slice(0, 6));
        setCompleted(doneRes.data.slice(0, 6));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load dashboard",
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

  const periodRevenue = useMemo(
    () => sales.reduce((sum, point) => sum + point.revenue, 0),
    [sales],
  );

  if (loading) return <p className="catalog-status">Loading dashboard…</p>;
  if (error) return <p className="msg error">{error}</p>;

  return (
    <div className="admin-dashboard">
      <div className="admin-cards">
        <article className="admin-card">
          <p>Outstanding</p>
          <strong>{summary?.outstanding ?? 0}</strong>
        </article>
        <article className="admin-card">
          <p>Completed</p>
          <strong>{summary?.completed ?? 0}</strong>
        </article>
        <article className="admin-card">
          <p>Revenue (ready/completed)</p>
          <strong>{formatPrice(summary?.revenue ?? 0)}</strong>
        </article>
        <article className="admin-card">
          <p>Last 30 days</p>
          <strong>{formatPrice(periodRevenue)}</strong>
        </article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Sales over time</h2>
        </div>
        <SalesChart points={sales} />
      </section>

      <div className="admin-split">
        <OrdersMiniTable title="Outstanding orders" orders={outstanding} />
        <OrdersMiniTable title="Completed orders" orders={completed} />
      </div>
    </div>
  );
}
