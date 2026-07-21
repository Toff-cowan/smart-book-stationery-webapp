"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Tab = "all" | "unread";

export default function AdminNotificationsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchNotifications(token)
      .then((res) => {
        if (!cancelled) setNotifications(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load notifications",
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

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const visible = useMemo(() => {
    if (tab === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, tab]);

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

  if (loading) {
    return <p className="catalog-status">Loading notifications…</p>;
  }

  return (
    <div className="admin-notifications">
      <div className="admin-tabs">
        <button
          type="button"
          className={tab === "all" ? "active" : ""}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          type="button"
          className={tab === "unread" ? "active" : ""}
          onClick={() => setTab("unread")}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      </div>

      {unreadCount > 0 ? (
        <div className="admin-notif-toolbar">
          <button type="button" className="admin-btn" onClick={onMarkAllRead}>
            Mark all read
          </button>
        </div>
      ) : null}

      {error ? <p className="msg error">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="admin-empty">
          {tab === "unread"
            ? "No unread notifications."
            : "No notifications yet."}
        </p>
      ) : (
        <ul className="admin-notif-list">
          {visible.map((note) => (
            <li
              key={note.id}
              className={`admin-notif-item${note.is_read ? " read" : ""}`}
            >
              <strong>{note.title}</strong>
              {note.body ? <p>{note.body}</p> : null}
              <time>
                {note.created_at
                  ? new Date(note.created_at).toLocaleString()
                  : ""}
              </time>
              <div className="admin-notif-actions">
                {!note.is_read ? (
                  <button type="button" onClick={() => onMarkRead(note)}>
                    Mark read
                  </button>
                ) : null}
                {note.booklist_id ? (
                  <Link href={`/admin/orders/${note.booklist_id}`}>
                    View order
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
