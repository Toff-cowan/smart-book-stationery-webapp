"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { ApiError, fetchInventory } from "@/lib/api";
import type { Department, InventoryItem } from "@/lib/types";

export function CatalogClient() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<"" | Department>("");
  const deferredSearch = useDeferredValue(search);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchInventory({
      q: deferredSearch,
      department,
      per_page: 48,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load catalog. Is the API running?",
        );
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, department]);

  return (
    <section className="catalog">
      <div className="catalog-intro">
        <h1>Browse the catalog</h1>
        <p>Filter and open any title for details, ratings, and add to cart.</p>
      </div>

      <div className="catalog-layout">
        <div className="catalog-main">
          <div className="catalog-status" aria-live="polite">
            {loading
              ? "Loading…"
              : error
                ? error
                : `${total} item${total === 1 ? "" : "s"}`}
          </div>

          {!loading && !error && items.length === 0 ? (
            <p className="empty">No items match these filters.</p>
          ) : (
            <div className="product-grid">
              {items.map((item) => (
                <ProductCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <ProductFilters
          search={search}
          department={department}
          onSearchChange={setSearch}
          onDepartmentChange={setDepartment}
        />
      </div>
    </section>
  );
}
