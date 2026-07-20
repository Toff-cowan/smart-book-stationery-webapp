"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteHeaderAuth } from "@/components/SiteHeaderAuth";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/catalog", label: "Catalog" },
  { href: "/cart", label: "Cart" },
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
          <SiteHeaderAuth />
        </nav>
      </div>
    </header>
  );
}
