"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";

type NotificationsMenuProps = {
  token: string;
  userName: string;
};

export function NotificationsMenu({ token, userName }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function loadNotifications() {
    setLoading(true);
    fetchNotifications(token)
      .then((res) => setNotifications(res.data))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadNotifications();
    // Refresh when navigating back to app views that remount auth
  }, [token]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onMarkRead(note: AppNotification) {
    if (note.is_read) return;
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
    try {
      await markAllNotificationsRead(token);
      setNotifications((prev) =>
        prev.map((row) => ({ ...row, is_read: true })),
      );
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`nav-notif-dropdown${open ? " open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={open ? "nav-link nav-btn active" : "nav-link nav-btn"}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadNotifications();
        }}
      >
        Notifications
        {unreadCount > 0 ? (
          <span
            className="nav-notif-badge"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <div
        id={menuId}
        className="nav-notif-panel"
        role="menu"
        hidden={!open}
      >
        <div className="nav-notif-panel-head">
          <strong>{`${userName}'s notifications`}</strong>
          {unreadCount > 0 ? (
            <button type="button" onClick={onMarkAllRead}>
              Mark all read
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="nav-notif-empty">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="nav-notif-empty">No notifications yet.</p>
        ) : (
          <ul className="nav-notif-list">
            {notifications.slice(0, 12).map((note) => (
              <li
                key={note.id}
                className={note.is_read ? "read" : undefined}
                role="menuitem"
              >
                <button
                  type="button"
                  className="nav-notif-item"
                  onClick={() => onMarkRead(note)}
                >
                  <strong>{note.title}</strong>
                  {note.body ? <span>{note.body}</span> : null}
                  <time>
                    {note.created_at
                      ? new Date(note.created_at).toLocaleString()
                      : ""}
                  </time>
                </button>
                {note.booklist_id ? (
                  <Link
                    href="/orders"
                    className="nav-notif-order-link"
                    onClick={() => setOpen(false)}
                  >
                    View orders
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
