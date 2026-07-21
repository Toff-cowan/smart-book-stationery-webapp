"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NotificationsMenu } from "@/components/NotificationsMenu";
import { useAuth } from "@/context/AuthContext";

export function SiteHeaderAuth() {
  const { user, token, ready, logout } = useAuth();
  const pathname = usePathname();

  if (!ready) {
    return <span className="nav-muted">…</span>;
  }

  if (user && token) {
    return (
      <div className="nav-auth">
        <Link
          href="/orders"
          className={
            pathname === "/orders" || pathname.startsWith("/orders/")
              ? "nav-link active"
              : "nav-link"
          }
        >
          Orders
        </Link>
        <NotificationsMenu token={token} />
        <span className="nav-user">{user.name}</span>
        <button type="button" className="nav-link nav-btn" onClick={logout}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className={pathname === "/login" ? "nav-link active" : "nav-link"}
    >
      Login / Register
    </Link>
  );
}
