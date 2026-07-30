"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { SiteHeaderAuth } from "@/components/SiteHeaderAuth";
import { Price } from "@/components/Price";
import { useAuth } from "@/context/AuthContext";
import { BRAND_NAME, LOGO_SRC } from "@/lib/brand";
import { fetchInventory } from "@/lib/api";
import { loadRecentSearches, pushRecentSearch } from "@/lib/recentSearches";
import { isStaff } from "@/lib/roles";
import type { InventoryItem } from "@/lib/types";

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
  const rootRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<InventoryItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchInventory({ q: term, per_page: 5 })
        .then((res) => {
          if (cancelled) return;
          setHits((res.data || []).slice(0, 5));
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function goCatalog(term: string) {
    const q = term.trim();
    if (q) pushRecentSearch(q);
    setRecent(loadRecentSearches());
    setOpen(false);
    router.push(q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog");
  }

  function goProduct(item: InventoryItem) {
    pushRecentSearch(query.trim() || item.name);
    setRecent(loadRecentSearches());
    setOpen(false);
    setQuery(item.name);
    router.push(`/catalog/${item.id}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    goCatalog(query);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    const term = query.trim();
    const showRecentOnly = term.length < 2;
    const recentRows = recent.slice(0, 5);
    const optionCount = showRecentOnly
      ? recentRows.length
      : hits.length + recentRows.length;
    if (!optionCount && e.key !== "Escape") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(optionCount, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? optionCount - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      if (showRecentOnly) {
        const termPick = recentRows[activeIndex];
        if (termPick) {
          setQuery(termPick);
          goCatalog(termPick);
        }
      } else if (activeIndex < hits.length) {
        goProduct(hits[activeIndex]);
      } else {
        const termPick = recentRows[activeIndex - hits.length];
        if (termPick) {
          setQuery(termPick);
          goCatalog(termPick);
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const term = query.trim();
  const recentRows = recent.slice(0, 5);
  const showPanel =
    open &&
    (recentRows.length > 0 || term.length >= 2 || loading);

  return (
    <form
      className="header-search"
      onSubmit={onSubmit}
      role="search"
      ref={rootRef}
    >
      <label className="sr-only" htmlFor="header-search-input">
        Search products
      </label>
      <div className="header-search-field">
        <input
          id="header-search-input"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Search by name or ISBN…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(loadRecentSearches());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {showPanel ? (
          <div id={listId} className="header-search-panel" role="listbox">
            {term.length >= 2 ? (
              <>
                <p className="header-search-label">Suggestions</p>
                {loading ? (
                  <p className="header-search-empty">Searching…</p>
                ) : hits.length === 0 ? (
                  <p className="header-search-empty">No matching books</p>
                ) : (
                  hits.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      className={
                        activeIndex === index
                          ? "header-search-item active"
                          : "header-search-item"
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goProduct(item)}
                    >
                      <span className="header-search-item-name">{item.name}</span>
                      <span className="header-search-item-meta">
                        {item.author ? `${item.author} · ` : null}
                        <Price value={item.price} />
                      </span>
                    </button>
                  ))
                )}
              </>
            ) : null}

            {recentRows.length > 0 ? (
              <>
                <p className="header-search-label">Previous searches</p>
                {recentRows.map((row, index) => {
                  const optionIndex =
                    term.length >= 2 ? hits.length + index : index;
                  return (
                    <button
                      key={row}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === optionIndex}
                      className={
                        activeIndex === optionIndex
                          ? "header-search-item recent active"
                          : "header-search-item recent"
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(row);
                        goCatalog(row);
                      }}
                    >
                      <span className="header-search-item-name">{row}</span>
                    </button>
                  );
                })}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
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
    document.documentElement.classList.toggle("catalog-menu-open", open);
    return () => {
      document.documentElement.classList.remove("catalog-menu-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: globalThis.KeyboardEvent) {
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
          <Link href="/booklist/scan" className="ribbon-link">
            Book scan
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
