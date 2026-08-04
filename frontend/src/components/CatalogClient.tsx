"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { ApiError, fetchInventory } from "@/lib/api";
import type { Department, InventoryItem } from "@/lib/types";

const PAGE_SIZE = 24;

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
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDepartment(departmentFromUrl);
  }, [departmentFromUrl]);

  useEffect(() => {
    setPage(1);
  }, [queryFromUrl, department, grade]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchInventory({
      q: queryFromUrl,
      department,
      grade,
      page,
      per_page: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
        setPages(res.pagination?.pages ?? 0);
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
        setPages(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryFromUrl, department, grade, page]);

  const totalPages =
    pages || (total > 0 ? Math.ceil(total / PAGE_SIZE) : 0);

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
          onDepartmentChange={(value) => {
            setDepartment(value);
          }}
          onGradeChange={(value) => {
            setGrade(value);
          }}
        />

        <div className="catalog-main">
          <div className="catalog-status" aria-live="polite">
            {loading
              ? "Loading…"
              : error
                ? error
                : `${total} item${total === 1 ? "" : "s"}${
                    totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""
                  }`}
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

          {totalPages > 1 ? (
            <nav className="catalog-pager" aria-label="Catalog pages">
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || page <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Previous
              </button>
              <div className="catalog-pager-pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => {
                    if (totalPages <= 7) return true;
                    return (
                      n === 1 ||
                      n === totalPages ||
                      Math.abs(n - page) <= 1
                    );
                  })
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === "number" && n - (arr[idx - 1] as number) > 1) {
                      acc.push("…");
                    }
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, idx) =>
                    n === "…" ? (
                      <span key={`gap-${idx}`} className="catalog-pager-gap">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        className={
                          n === page
                            ? "catalog-pager-btn active"
                            : "catalog-pager-btn"
                        }
                        disabled={loading}
                        onClick={() => {
                          setPage(n);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        {n}
                      </button>
                    ),
                  )}
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || page >= totalPages}
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Next
              </button>
            </nav>
          ) : null}
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
