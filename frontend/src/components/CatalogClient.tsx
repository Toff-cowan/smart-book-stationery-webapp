"use client";

import { Suspense, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { ApiError, fetchInventory } from "@/lib/api";
import type { Department, InventoryItem } from "@/lib/types";

function CatalogInner() {
  const searchParams = useSearchParams();
  const schoolFromUrl = searchParams.get("school")?.trim() ?? "";
  const queryFromUrl = searchParams.get("q")?.trim() ?? "";
  const departmentParam = searchParams.get("department")?.trim() ?? "";
  const departmentFromUrl =
    departmentParam === "textbooks" ||
    departmentParam === "stationery" ||
    departmentParam === "gifts"
      ? departmentParam
      : "";

  const [search, setSearch] = useState(queryFromUrl);
  const [department, setDepartment] = useState<"" | Department>(departmentFromUrl);
  const [school, setSchool] = useState(schoolFromUrl);
  const [grade, setGrade] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSchool(schoolFromUrl);
  }, [schoolFromUrl]);

  useEffect(() => {
    setSearch(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    setDepartment(departmentFromUrl);
  }, [departmentFromUrl]);

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

export function CatalogClient() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading catalog…</p>}>
      <CatalogInner />
    </Suspense>
  );
}
