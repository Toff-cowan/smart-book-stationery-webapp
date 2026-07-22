"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { NotificationsMenu } from "@/components/NotificationsMenu";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";

export function SiteHeaderAuth() {
  const { user, token, ready, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
        <NotificationsMenu token={token} userName={user.name} />
        <div
          className={`nav-account-dropdown${menuOpen ? " open" : ""}`}
          ref={menuRef}
        >
          <button
            type="button"
            className={
              menuOpen ||
              pathname === "/profile" ||
              pathname.startsWith("/profile/")
                ? "nav-account-trigger active"
                : "nav-account-trigger"
            }
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <UserAvatar name={user.name} avatarUrl={user.avatar_url} />
            <span className="nav-account-name">{user.name}</span>
          </button>
          <div
            id={menuId}
            className="nav-account-panel"
            role="menu"
            hidden={!menuOpen}
          >
            <p className="nav-account-panel-label">{user.email}</p>
            <Link
              href="/profile"
              role="menuitem"
              className="nav-account-item"
              onClick={() => setMenuOpen(false)}
            >
              View profile
            </Link>
            <Link
              href="/profile/edit"
              role="menuitem"
              className="nav-account-item"
              onClick={() => setMenuOpen(false)}
            >
              Edit profile
            </Link>
            <button
              type="button"
              role="menuitem"
              className="nav-account-item danger"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
            >
              Log out
            </button>
          </div>
        </div>
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
