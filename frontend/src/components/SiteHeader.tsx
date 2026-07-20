"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteHeaderAuth } from "@/components/SiteHeaderAuth";
import { useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/catalog", label: "Catalog" },
] as const;

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : href === "/catalog"
        ? pathname === "/catalog" || pathname.startsWith("/catalog/")
        : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={active ? "nav-link active" : "nav-link"}>
      {label}
    </Link>
  );
}

function CartNavLink() {
  const { token, ready } = useAuth();
  const pathname = usePathname();
  const active = pathname === "/cart" || pathname.startsWith("/cart/");
  const href = !ready || token ? "/cart" : "/login?next=/cart";

  return (
    <Link href={href} className={active ? "nav-link active" : "nav-link"}>
      Cart
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          Smart Book Stationery
        </Link>
        <nav className="site-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} />
          ))}
          <CartNavLink />
          <SiteHeaderAuth />
        </nav>
      </div>
    </header>
  );
}
