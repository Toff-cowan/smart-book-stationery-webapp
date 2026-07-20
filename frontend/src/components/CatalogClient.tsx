"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { ApiError, fetchInventory } from "@/lib/api";
import type { Department, InventoryItem } from "@/lib/types";

export function CatalogClient() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<"" | Department>("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
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
      school,
      grade,
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
  }, [deferredSearch, department, school, grade]);

  return (
    <section className="catalog">
      <div className="catalog-intro">
        <h1>Browse the catalog</h1>
        <p>Filter by school, grade, or department, then open any title for details.</p>
      </div>

      <label className="catalog-search search-field">
        <span className="filter-label">Search</span>
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      <div className="catalog-layout">
        <ProductFilters
          department={department}
          school={school}
          grade={grade}
          onDepartmentChange={setDepartment}
          onSchoolChange={setSchool}
          onGradeChange={setGrade}
        />

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
      </div>
    </section>
  );
}
