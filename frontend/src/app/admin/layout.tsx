"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/inventory", label: "Inventory" },
] as const;

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/inventory")) return "Inventory";
  return "Dashboard";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, token, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const title = pageTitle(pathname);

  useEffect(() => {
    if (!ready) return;
    if (!token || !user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/");
    }
  }, [ready, token, user, router]);

  if (!ready || !user || user.role !== "admin") {
    return <p className="catalog-status">Checking admin access…</p>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div>
          <p className="admin-kicker">Staff</p>
          <h1>{title}</h1>
        </div>
        <p className="admin-user">Signed in as {user.name}</p>
      </header>

      <nav className="admin-nav" aria-label="Admin">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "admin-nav-link active" : "admin-nav-link"}
            >
              {link.label}
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
