"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Price } from "@/components/Price";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  fetchCustomerOrders,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type CustomerOrder,
} from "@/lib/api";

export default function ProfilePage() {
  const { user, token, ready, refreshUser } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    void refreshUser();
  }, [ready, token, refreshUser]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setOrders([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchCustomerOrders(token),
      fetchNotifications(token),
    ])
      .then(([ordersRes, notesRes]) => {
        if (cancelled) return;
        setOrders(ordersRes.data);
        setNotifications(notesRes.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load your profile",
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

  async function onMarkRead(note: AppNotification) {
    if (!token || note.is_read) return;
    try {
      const res = await markNotificationRead(note.id, token);
      setNotifications((prev) =>
        prev.map((row) => (row.id === note.id ? res.data : row)),
      );
    } catch {
      /* ignore */
    }
  }

  async function onMarkAllRead() {
    if (!token) return;
    try {
      await markAllNotificationsRead(token);
      setNotifications((prev) =>
        prev.map((row) => ({ ...row, is_read: true })),
      );
    } catch {
      /* ignore */
    }
  }

  if (!ready || loading) {
    return <p className="catalog-status">Loading profile…</p>;
  }

  if (!token || !user) {
    return (
      <section className="customer-profile">
        <h1>Your profile</h1>
        <p className="customer-profile-lead">
          <Link href={`/login?next=${encodeURIComponent("/profile")}`}>
            Sign in
          </Link>{" "}
          to view your account, orders, and notifications.
        </p>
      </section>
    );
  }

  const recentOrders = orders.slice(0, 5);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <section className="customer-profile">
      <header className="customer-profile-hero">
        <div className="customer-profile-identity">
          <UserAvatar
            name={user.name}
            avatarUrl={user.avatar_url}
            size="md"
            className="customer-profile-avatar"
          />
          <div>
            <h1>{user.name}</h1>
            <p className="customer-profile-meta">{user.email}</p>
            {user.phone ? (
              <p className="customer-profile-meta">{user.phone}</p>
            ) : (
              <p className="customer-profile-meta muted">No phone on file</p>
            )}
          </div>
        </div>
        <div className="customer-profile-actions">
          <Link href="/profile/edit" className="btn-primary">
            Edit profile
          </Link>
          <Link href="/cart" className="btn-secondary">
            Go to cart
          </Link>
          <Link href="/orders" className="btn-secondary">
            All orders
          </Link>
        </div>
      </header>

      {error ? <p className="msg error">{error}</p> : null}

      <div className="customer-profile-grid">
        <section className="customer-profile-panel">
          <header className="customer-profile-panel-head">
            <h2>Recent orders</h2>
            <Link href="/orders">View all</Link>
          </header>
          {recentOrders.length === 0 ? (
            <p className="customer-profile-empty">
              No orders yet.{" "}
              <Link href="/catalog">Browse the catalog</Link> and request a
              quote from your cart.
            </p>
          ) : (
            <ul className="customer-profile-orders">
              {recentOrders.map((order) => {
                const itemCount = order.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                );
                return (
                  <li key={order.id}>
                    <Link href={`/orders?order=${order.id}`}>
                      <span className="customer-profile-order-id">
                        Order #{order.id}
                      </span>
                      <span className="customer-profile-order-meta">
                        {order.submitted_at
                          ? new Date(order.submitted_at).toLocaleDateString()
                          : "—"}
                        {" · "}
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                        {" · "}
                        <Price value={order.grand_total} />
                      </span>
                      <span className={`admin-status ${order.status}`}>
                        {order.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="customer-profile-panel">
          <header className="customer-profile-panel-head">
            <h2>
              {`${user.name}'s notifications`}
              {unreadCount > 0 ? (
                <span className="customer-profile-badge">{unreadCount}</span>
              ) : null}
            </h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="customer-profile-text-btn"
                onClick={() => void onMarkAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </header>
          {notifications.length === 0 ? (
            <p className="customer-profile-empty">No notifications yet.</p>
          ) : (
            <ul className="customer-profile-notes">
              {notifications.slice(0, 8).map((note) => (
                <li
                  key={note.id}
                  className={note.is_read ? "read" : undefined}
                >
                  {note.booklist_id ? (
                    <Link
                      href={`/orders?order=${note.booklist_id}`}
                      onClick={() => void onMarkRead(note)}
                    >
                      <strong>{note.title}</strong>
                      {note.body ? <span>{note.body}</span> : null}
                      {note.created_at ? (
                        <time dateTime={note.created_at}>
                          {new Date(note.created_at).toLocaleString()}
                        </time>
                      ) : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="customer-profile-note-btn"
                      onClick={() => void onMarkRead(note)}
                    >
                      <strong>{note.title}</strong>
                      {note.body ? <span>{note.body}</span> : null}
                      {note.created_at ? (
                        <time dateTime={note.created_at}>
                          {new Date(note.created_at).toLocaleString()}
                        </time>
                      ) : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
