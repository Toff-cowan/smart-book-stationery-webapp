"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/AuthContext";

export function SiteHeaderAuth() {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();

  if (!ready) {
    return <span className="nav-muted">…</span>;
  }

  if (user) {
    return (
      <div className="nav-auth">
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
