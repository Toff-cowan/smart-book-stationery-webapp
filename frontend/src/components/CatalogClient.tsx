"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { ApiError, fetchInventory } from "@/lib/api";
import type { Department, InventoryItem } from "@/lib/types";

function CatalogInner() {
  const searchParams = useSearchParams();
  const queryFromUrl = searchParams.get("q")?.trim() ?? "";
  const departmentParam = searchParams.get("department")?.trim() ?? "";
  const departmentFromUrl =
    departmentParam === "textbooks" ||
    departmentParam === "stationery" ||
    departmentParam === "gifts"
      ? departmentParam
      : "";

  const [department, setDepartment] = useState<"" | Department>(departmentFromUrl);
  const [grade, setGrade] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDepartment(departmentFromUrl);
  }, [departmentFromUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchInventory({
      q: queryFromUrl,
      department,
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
  }, [queryFromUrl, department, grade]);

  return (
    <section className="catalog">
      <div className="catalog-intro">
        <h1>Browse the catalog</h1>
        <p>
          Use the search bar at the top for name or ISBN, then filter by grade
          or department.
          {queryFromUrl ? (
            <>
              {" "}
              Showing results for <strong>“{queryFromUrl}”</strong>.
            </>
          ) : null}
        </p>
      </div>

      <div className="catalog-layout">
        <ProductFilters
          department={department}
          grade={grade}
          onDepartmentChange={setDepartment}
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
