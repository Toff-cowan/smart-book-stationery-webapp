"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchAdminSales,
  fetchAdminSummary,
  fetchNotifications,
  type AdminSummary,
  type SalesPoint,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { Price } from "@/components/Price";

function SalesChart({ points }: { points: SalesPoint[] }) {
  const { formatPrice } = useCurrency();
  const max = Math.max(...points.map((p) => p.revenue), 1);

  return (
    <div className="admin-chart" role="img" aria-label="Sales over time">
      <div className="admin-chart-bars">
        {points.map((point) => {
          const height = Math.max(
            (point.revenue / max) * 100,
            point.revenue > 0 ? 4 : 0,
          );
          return (
            <div
              key={point.date}
              className="admin-chart-col"
              title={`${point.date}: ${formatPrice(point.revenue)}`}
            >
              <div
                className="admin-chart-bar"
                style={{ height: `${height}%` }}
              />
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

export default function AdminDashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [sales, setSales] = useState<SalesPoint[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAdminSummary(token),
      fetchAdminSales(token, 30),
      fetchNotifications(token),
    ])
      .then(([sum, salesRes, notes]) => {
        if (cancelled) return;
        setSummary(sum.data);
        setSales(salesRes.data);
        setUnreadCount(notes.data.filter((n) => !n.is_read).length);
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
          <p>Cancelled</p>
          <strong>{summary?.cancelled ?? 0}</strong>
        </article>
        <Link href="/admin/notifications" className="admin-card admin-card-link">
          <p>Notifications</p>
          <strong>{unreadCount}</strong>
          <span className="admin-card-hint">
            {unreadCount === 1 ? "unread" : "unread"} · open inbox
          </span>
        </Link>
        <article className="admin-card">
          <p>Revenue (ready/completed)</p>
          <strong>
            <Price value={summary?.revenue ?? 0} />
          </strong>
        </article>
        <article className="admin-card">
          <p>Last 30 days</p>
          <strong>
            <Price value={periodRevenue} />
          </strong>
        </article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Sales over time</h2>
        </div>
        <SalesChart points={sales} />
      </section>
    </div>
  );
}
