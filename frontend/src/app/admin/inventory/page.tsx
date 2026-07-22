"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  ApiError,
  deleteAdminInventoryItem,
  fetchAdminInventory,
  updateAdminInventoryItem,
  uploadAdminInventoryImage,
} from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import type { Department, InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

const PAGE_SIZE = 15;

type EditDraft = {
  name: string;
  department: Department;
  quantity: string;
  price: string;
  description: string;
  author: string;
  publisher: string;
  vendor: string;
  isbn: string;
  image_url: string;
  is_active: boolean;
};

type ActiveFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type DepartmentFilter = "all" | Department;

function toDraft(item: InventoryItem): EditDraft {
  return {
    name: item.name,
    department: item.department,
    quantity: String(item.stock),
    price: String(item.price),
    description: item.description ?? "",
    author: item.author ?? "",
    publisher: item.publisher ?? "",
    vendor: item.vendor ?? "",
    isbn: item.isbn ?? "",
    image_url: item.image_url ?? "",
    is_active: item.is_active,
  };
}

function matchesQuery(item: InventoryItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    String(item.id),
    item.name,
    item.department,
    item.author,
    item.publisher,
    item.vendor,
    item.isbn,
    item.description,
    item.school,
    item.image_url,
    ...(item.grades || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function truncate(value: string | null | undefined, max = 40) {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default function AdminInventoryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [department, setDepartment] = useState<DepartmentFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [school, setSchool] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const schools = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      if (item.school?.trim()) names.add(item.school.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!matchesQuery(item, deferredSearch)) return false;
      if (department !== "all" && item.department !== department) return false;
      if (activeFilter === "active" && !item.is_active) return false;
      if (activeFilter === "inactive" && item.is_active) return false;
      if (stockFilter === "in_stock" && item.stock <= 0) return false;
      if (stockFilter === "out_of_stock" && item.stock > 0) return false;
      if (school !== "all" && (item.school || "").trim() !== school) {
        return false;
      }
      return true;
    });
  }, [
    items,
    deferredSearch,
    department,
    activeFilter,
    stockFilter,
    school,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [deferredSearch, department, activeFilter, stockFilter, school]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    // Drop selections that are no longer on the current page view
    const visibleIds = new Set(pageItems.map((item) => item.id));
    setSelected((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [pageItems]);

  // Only leave edit mode when the row is filtered out — not on every
  // deferred search tick (that was closing the editor immediately).
  useEffect(() => {
    if (editingId == null) return;
    if (!filteredItems.some((item) => item.id === editingId)) {
      setEditingId(null);
      setDraft(null);
    }
  }, [filteredItems, editingId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchAdminInventory(token)
      .then((res) => {
        if (!cancelled) setItems(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load inventory",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setDraft(toDraft(item));
    setError(null);
    setInfo(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(e?: FormEvent) {
    e?.preventDefault();
    if (!token || !draft || editingId == null) return;

    const quantity = Number(draft.quantity);
    const price = Number(draft.price);
    if (Number.isNaN(quantity) || quantity < 0) {
      setError("Stock must be a valid number.");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Price must be a valid number.");
      return;
    }
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }

    setBusyId(editingId);
    setError(null);
    setInfo(null);
    try {
      const res = await updateAdminInventoryItem(
        editingId,
        {
          name: draft.name.trim(),
          department: draft.department,
          quantity,
          price,
          description: draft.description.trim() || null,
          author: draft.author.trim() || null,
          publisher: draft.publisher.trim() || null,
          vendor: draft.vendor.trim() || null,
          isbn: draft.isbn.trim() || null,
          image_url: draft.image_url.trim() || null,
          is_active: draft.is_active,
        },
        token,
      );
      setItems((prev) =>
        prev.map((row) => (row.id === editingId ? res.data : row)),
      );
      setInfo(`Updated ${res.data.name}`);
      cancelEdit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(item: InventoryItem) {
    if (!token) return;
    setBusyId(item.id);
    setError(null);
    setInfo(null);
    try {
      const res = await updateAdminInventoryItem(
        item.id,
        { is_active: !item.is_active },
        token,
      );
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? res.data : row)),
      );
      setInfo(`Updated ${res.data.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onUploadImage(itemId: number, file: File | null) {
    if (!token || !file) return;
    setBusyId(itemId);
    setError(null);
    setInfo(null);
    try {
      const res = await uploadAdminInventoryImage(itemId, file, token);
      setItems((prev) =>
        prev.map((row) => (row.id === itemId ? res.data : row)),
      );
      if (editingId === itemId && draft) {
        setDraft({ ...draft, image_url: res.data.image_url ?? "" });
      }
      setInfo(`Image uploaded for ${res.data.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Image upload failed");
    } finally {
      setBusyId(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setDepartment("all");
    setActiveFilter("all");
    setStockFilter("all");
    setSchool("all");
    setPage(1);
  }

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((item) => selected.has(item.id));

  function toggleSelectAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const item of pageItems) next.delete(item.id);
      } else {
        for (const item of pageItems) next.add(item.id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteItems(ids: number[]) {
    if (!token || ids.length === 0) return;
    const label =
      ids.length === 1
        ? "Permanently delete this product?"
        : `Permanently delete ${ids.length} selected products?`;
    if (
      !window.confirm(
        `${label}\n\nThis cannot be undone. They will be removed from the catalog, carts, and orders.`,
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    setInfo(null);
    try {
      const removed = new Set<number>();
      for (const id of ids) {
        await deleteAdminInventoryItem(id, token);
        removed.add(id);
      }
      setItems((prev) => prev.filter((row) => !removed.has(row.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      if (editingId != null && removed.has(editingId)) {
        cancelEdit();
      }
      setInfo(
        removed.size === 1
          ? "Product deleted."
          : `${removed.size} products deleted.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading) return <p className="catalog-status">Loading inventory…</p>;

  const rangeStart =
    filteredItems.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredItems.length);

  return (
    <div className="admin-inventory">
      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <div className="admin-inventory-toolbar">
        <label className="admin-inventory-search">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            placeholder="Search id, name, author, school…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="admin-inventory-filters">
          <label>
            <span>Department</span>
            <select
              value={department}
              onChange={(e) =>
                setDepartment(e.target.value as DepartmentFilter)
              }
            >
              <option value="all">All</option>
              <option value="textbooks">Textbooks</option>
              <option value="stationery">Stationery</option>
              <option value="gifts">Gifts</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as ActiveFilter)
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label>
            <span>Stock</span>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            >
              <option value="all">All</option>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </label>

          <label>
            <span>School</span>
            <select
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            >
              <option value="all">All</option>
              {schools.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="admin-btn"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>

        {selected.size > 0 ? (
          <div className="admin-inventory-selection">
            <span>{selected.size} selected</span>
            <button
              type="button"
              className="admin-btn danger"
              disabled={bulkBusy}
              onClick={() => void deleteItems(Array.from(selected))}
            >
              {bulkBusy ? "Deleting…" : "Delete selected"}
            </button>
            <button
              type="button"
              className="admin-btn"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        ) : null}

        <p className="admin-inventory-count">
          {filteredItems.length === 0
            ? "0 rows"
            : `rows ${rangeStart}–${rangeEnd} of ${filteredItems.length}`}
          {filteredItems.length !== items.length
            ? ` · filtered from ${items.length}`
            : ""}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="admin-empty">No inventory items yet.</p>
      ) : filteredItems.length === 0 ? (
        <p className="admin-empty">No products match the current filters.</p>
      ) : (
        <>
          <div className="admin-db-table-wrap">
              <table className="admin-db-table">
                <thead>
                  <tr>
                    <th className="admin-db-check">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th>id</th>
                    <th>name</th>
                    <th>department</th>
                    <th>author</th>
                    <th>publisher</th>
                    <th>vendor</th>
                    <th>isbn</th>
                    <th>school</th>
                    <th>stock</th>
                    <th>price</th>
                    <th>is_active</th>
                    <th>image</th>
                    <th>description</th>
                    <th>actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    const isEditing = editingId === item.id && draft;
                    return (
                      <tr
                        key={item.id}
                        className={
                          isEditing
                            ? "admin-db-row editing"
                            : item.is_active
                              ? selected.has(item.id)
                                ? "admin-db-row selected"
                                : undefined
                              : "admin-db-row inactive"
                        }
                      >
                        <td className="admin-db-check">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelectOne(item.id)}
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                        <td className="admin-db-id">{item.id}</td>

                        <td>
                          {isEditing ? (
                            <input
                              className="admin-db-input"
                              value={draft.name}
                              onChange={(e) =>
                                setDraft({ ...draft, name: e.target.value })
                              }
                              required
                            />
                          ) : (
                            <span title={item.name}>
                              {truncate(item.name, 48)}
                            </span>
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <select
                              className="admin-db-input"
                              value={draft.department}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  department: e.target.value as Department,
                                })
                              }
                            >
                              <option value="textbooks">textbooks</option>
                              <option value="stationery">stationery</option>
                              <option value="gifts">gifts</option>
                            </select>
                          ) : (
                            item.department
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <input
                              className="admin-db-input"
                              value={draft.author}
                              onChange={(e) =>
                                setDraft({ ...draft, author: e.target.value })
                              }
                            />
                          ) : (
                            truncate(item.author, 28)
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <input
                              className="admin-db-input"
                              value={draft.publisher}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  publisher: e.target.value,
                                })
                              }
                            />
                          ) : (
                            truncate(item.publisher, 28)
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <input
                              className="admin-db-input"
                              value={draft.vendor}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  vendor: e.target.value,
                                })
                              }
                              placeholder="Vendor"
                            />
                          ) : (
                            truncate(item.vendor, 28)
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <input
                              className="admin-db-input"
                              value={draft.isbn}
                              onChange={(e) =>
                                setDraft({ ...draft, isbn: e.target.value })
                              }
                              placeholder="ISBN"
                            />
                          ) : (
                            truncate(item.isbn, 18)
                          )}
                        </td>

                        <td title={item.school || undefined}>
                          {truncate(item.school, 24)}
                        </td>

                        <td className="admin-db-num">
                          {isEditing ? (
                            <input
                              className="admin-db-input admin-db-input-sm"
                              type="number"
                              min={0}
                              value={draft.quantity}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  quantity: e.target.value,
                                })
                              }
                              required
                            />
                          ) : (
                            item.stock
                          )}
                        </td>

                        <td className="admin-db-num">
                          {isEditing ? (
                            <input
                              className="admin-db-input admin-db-input-sm"
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.price}
                              onChange={(e) =>
                                setDraft({ ...draft, price: e.target.value })
                              }
                              required
                            />
                          ) : (
                            <Price value={item.price} />
                          )}
                        </td>

                        <td className="admin-db-bool">
                          {isEditing ? (
                            <input
                              type="checkbox"
                              checked={draft.is_active}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  is_active: e.target.checked,
                                })
                              }
                              aria-label="Active"
                            />
                          ) : (
                            <span
                              className={
                                item.is_active
                                  ? "admin-db-true"
                                  : "admin-db-false"
                              }
                            >
                              {item.is_active ? "true" : "false"}
                            </span>
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <div className="admin-image-edit">
                              {mediaUrl(draft.image_url) ? (
                                <div
                                  className="admin-image-thumb"
                                  style={{
                                    backgroundImage: `url(${mediaUrl(draft.image_url)})`,
                                  }}
                                  aria-label="Image preview"
                                />
                              ) : null}
                              <label className="admin-image-file">
                                <span>Upload image</span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  disabled={busyId === item.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    e.target.value = "";
                                    void onUploadImage(item.id, file);
                                  }}
                                />
                              </label>
                              <input
                                className="admin-db-input"
                                type="text"
                                value={draft.image_url}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    image_url: e.target.value,
                                  })
                                }
                                placeholder="Or paste image URL…"
                              />
                            </div>
                          ) : mediaUrl(item.image_url) ? (
                            <div
                              className="admin-image-thumb"
                              style={{
                                backgroundImage: `url(${mediaUrl(item.image_url)})`,
                              }}
                              title={item.image_url || undefined}
                            />
                          ) : (
                            "—"
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <textarea
                              className="admin-db-input admin-db-textarea"
                              rows={2}
                              value={draft.description}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  description: e.target.value,
                                })
                              }
                            />
                          ) : (
                            <span title={item.description || undefined}>
                              {truncate(item.description, 40)}
                            </span>
                          )}
                        </td>

                        <td className="admin-db-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="admin-btn primary"
                                disabled={busyId === item.id}
                                onClick={() => void saveEdit()}
                              >
                                {busyId === item.id ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="admin-btn"
                                disabled={busyId === item.id || bulkBusy}
                                onClick={() => startEdit(item)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="admin-btn"
                                disabled={busyId === item.id || bulkBusy}
                                onClick={() => toggleActive(item)}
                              >
                                {item.is_active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn danger"
                                disabled={busyId === item.id || bulkBusy}
                                onClick={() => void deleteItems([item.id])}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          {totalPages > 1 ? (
            <nav className="admin-pagination" aria-label="Inventory pages">
              <button
                type="button"
                className="admin-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="admin-pagination-status">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="admin-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
