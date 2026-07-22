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
import { isOwner } from "@/lib/roles";

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
  const { token, user } = useAuth();
  const owner = isOwner(user?.role);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [sales, setSales] = useState<SalesPoint[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);

    const tasks: Promise<unknown>[] = [fetchNotifications(token)];
    if (owner) {
      tasks.unshift(fetchAdminSummary(token), fetchAdminSales(token, 30));
    }

    Promise.all(tasks)
      .then((results) => {
        if (cancelled) return;
        if (owner) {
          const [sum, salesRes, notes] = results as [
            { data: AdminSummary },
            { data: SalesPoint[] },
            { data: { is_read: boolean }[] },
          ];
          setSummary(sum.data);
          setSales(salesRes.data);
          setUnreadCount(notes.data.filter((n) => !n.is_read).length);
        } else {
          const [notes] = results as [{ data: { is_read: boolean }[] }];
          setUnreadCount(notes.data.filter((n) => !n.is_read).length);
        }
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
  }, [token, owner]);

  const periodRevenue = useMemo(
    () => sales.reduce((sum, point) => sum + point.revenue, 0),
    [sales],
  );

  if (loading) return <p className="catalog-status">Loading dashboard…</p>;
  if (error) return <p className="msg error">{error}</p>;

  return (
    <div className="admin-dashboard">
      <div className="admin-cards">
        {owner && summary ? (
          <>
            <article className="admin-card">
              <p>Outstanding</p>
              <strong>{summary.outstanding}</strong>
            </article>
            <article className="admin-card">
              <p>Completed</p>
              <strong>{summary.completed}</strong>
            </article>
            <article className="admin-card">
              <p>Cancelled</p>
              <strong>{summary.cancelled}</strong>
            </article>
          </>
        ) : (
          <>
            <Link href="/admin/orders" className="admin-card admin-card-link">
              <p>Orders</p>
              <strong>Open</strong>
              <span className="admin-card-hint">View and update requests</span>
            </Link>
            <Link href="/admin/inventory" className="admin-card admin-card-link">
              <p>Inventory</p>
              <strong>Manage</strong>
              <span className="admin-card-hint">Update products & stock</span>
            </Link>
          </>
        )}
        <Link href="/admin/notifications" className="admin-card admin-card-link">
          <p>Notifications</p>
          <strong>{unreadCount}</strong>
          <span className="admin-card-hint">
            {unreadCount === 1 ? "unread" : "unread"} · open inbox
          </span>
        </Link>
        {owner ? (
          <>
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
          </>
        ) : null}
      </div>

      {owner ? (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Sales over time</h2>
          </div>
          <SalesChart points={sales} />
        </section>
      ) : (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Staff workspace</h2>
          </div>
          <p className="admin-employee-note">
            You can update products and manage customer orders. Revenue and the
            registered users list are available to the store owner only.
          </p>
          <div className="admin-employee-links">
            <Link href="/admin/orders" className="btn-primary">
              Go to orders
            </Link>
            <Link href="/admin/inventory" className="btn-secondary">
              Go to inventory
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
