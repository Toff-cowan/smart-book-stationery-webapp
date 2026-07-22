"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { SiteHeaderAuth } from "@/components/SiteHeaderAuth";
import { useAuth } from "@/context/AuthContext";
import { BRAND_NAME, LOGO_SRC } from "@/lib/brand";
import { isStaff } from "@/lib/roles";

const CATALOG_CATEGORIES = [
  { href: "/catalog", label: "All items" },
  { href: "/catalog?department=textbooks", label: "Textbooks" },
  { href: "/catalog?department=stationery", label: "Stationery" },
  { href: "/catalog?department=gifts", label: "Gifts" },
] as const;

function CartNavLink() {
  const { token, ready } = useAuth();
  const pathname = usePathname();
  const active = pathname === "/cart" || pathname.startsWith("/cart/");
  const href = !ready || token ? "/cart" : "/login?next=/cart";

  return (
    <Link
      href={href}
      className={active ? "nav-link nav-cart active" : "nav-link nav-cart"}
    >
      Cart
    </Link>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    const href = q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog";
    router.push(href);
  }

  return (
    <form className="header-search" onSubmit={onSubmit} role="search">
      <label className="sr-only" htmlFor="header-search-input">
        Search products
      </label>
      <input
        id="header-search-input"
        type="search"
        placeholder="Search books, stationery, schools…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <button type="submit" className="header-search-btn">
        Search
      </button>
    </form>
  );
}

function CatalogDropdown() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = pathname.startsWith("/catalog");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  return (
    <div
      className={`ribbon-dropdown${open ? " open" : ""}${active ? " active" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={active || open ? "ribbon-link active" : "ribbon-link"}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        Catalog
        <span className="ribbon-chevron" aria-hidden="true" />
      </button>
      <div id={menuId} className="ribbon-menu" role="menu" hidden={!open}>
        {CATALOG_CATEGORIES.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="ribbon-menu-link"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-bar">
        <div className="site-header-inner">
          <Link href="/" className="brand-lockup" aria-label={`${BRAND_NAME} home`}>
            <span className="brand-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_SRC} alt={BRAND_NAME} />
            </span>
          </Link>

          <HeaderSearch />

          <nav className="site-nav site-nav-right" aria-label="Account">
            <SiteHeaderAuth />
            <CartNavLink />
          </nav>
        </div>
      </div>

      <div className="site-nav-ribbon">
        <nav className="site-nav-ribbon-inner" aria-label="Primary">
          <Link
            href="/"
            className={pathname === "/" ? "ribbon-link active" : "ribbon-link"}
          >
            Home
          </Link>
          <CatalogDropdown />
          <Link href="/#booklists" className="ribbon-link">
            School lists
          </Link>
          <AdminRibbonLink />
        </nav>
      </div>
    </header>
  );
}

function AdminRibbonLink() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  if (!ready || !isStaff(user?.role)) return null;
  return (
    <Link
      href="/admin"
      className={
        pathname.startsWith("/admin") ? "ribbon-link active" : "ribbon-link"
      }
    >
      Admin
    </Link>
  );
}
