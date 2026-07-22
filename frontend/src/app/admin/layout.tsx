"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { UserAvatar } from "@/components/UserAvatar";
import { fetchNotifications } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isOwner, isStaff, roleLabel } from "@/lib/roles";

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/inventory")) return "Inventory";
  if (pathname.startsWith("/admin/notifications")) return "Notifications";
  if (pathname.startsWith("/admin/users")) return "Users";
  if (pathname.startsWith("/admin/carousel")) return "Carousel";
  if (pathname.startsWith("/admin/newsletter")) return "Mailing list";
  return "Dashboard";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, token, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = pageTitle(pathname);
  const [unreadCount, setUnreadCount] = useState(0);
  const owner = isOwner(user?.role);

  const links = useMemo(() => {
    const items: { href: string; label: string; exact?: boolean }[] = [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/inventory", label: "Inventory" },
      { href: "/admin/notifications", label: "Notifications" },
    ];
    if (owner) {
      items.push(
        { href: "/admin/carousel", label: "Carousel" },
        { href: "/admin/newsletter", label: "Mailing list" },
        { href: "/admin/users", label: "Users" },
      );
    }
    return items;
  }, [owner]);

  useEffect(() => {
    if (!ready) return;
    if (!token || !user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!isStaff(user.role)) {
      router.replace("/");
    }
  }, [ready, token, user, router]);

  useEffect(() => {
    if (!token || !isStaff(user?.role)) return;
    let cancelled = false;
    fetchNotifications(token)
      .then((res) => {
        if (!cancelled) {
          setUnreadCount(res.data.filter((n) => !n.is_read).length);
        }
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.role, pathname]);

  useEffect(() => {
    if (!ready || !user) return;
    if (
      (pathname.startsWith("/admin/users") ||
        pathname.startsWith("/admin/carousel") ||
        pathname.startsWith("/admin/newsletter")) &&
      !isOwner(user.role)
    ) {
      router.replace("/admin");
    }
  }, [ready, user, pathname, router]);

  if (!ready || !user || !isStaff(user.role)) {
    return <p className="catalog-status">Checking admin access…</p>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div>
          <p className="admin-kicker">{roleLabel(user.role)} portal</p>
          <h1>{title}</h1>
        </div>
        <p className="admin-user">
          Signed in as{" "}
          <Link href="/profile" className="admin-user-link">
            <UserAvatar
              name={user.name}
              avatarUrl={user.avatar_url}
              className="admin-user-avatar"
            />
            <span>{user.name}</span>
          </Link>
        </p>
      </header>

      <nav className="admin-nav" aria-label="Admin">
        {links.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const showBadge =
            link.href === "/admin/notifications" && unreadCount > 0;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "admin-nav-link active" : "admin-nav-link"}
            >
              {link.label}
              {showBadge ? (
                <span className="admin-nav-badge" aria-label={`${unreadCount} unread`}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
        <Link href="/" className="admin-nav-link">
          Back to store
        </Link>
      </nav>

      <div className="admin-content">{children}</div>
    </div>
  );
}
