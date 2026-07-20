"use client";

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ApiError,
  fetchAdminInventory,
  updateAdminInventoryItem,
} from "@/lib/api";
import { coverGradient, formatPrice } from "@/lib/format";
import type { Department, InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

type EditDraft = {
  name: string;
  department: Department;
  quantity: string;
  price: string;
  description: string;
  author: string;
  publisher: string;
  image_url: string;
  is_active: boolean;
};

function toDraft(item: InventoryItem): EditDraft {
  return {
    name: item.name,
    department: item.department,
    quantity: String(item.stock),
    price: String(item.price),
    description: item.description ?? "",
    author: item.author ?? "",
    publisher: item.publisher ?? "",
    image_url: item.image_url ?? "",
    is_active: item.is_active,
  };
}

function matchesQuery(item: InventoryItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.name,
    item.department,
    item.author,
    item.publisher,
    item.description,
    item.school,
    ...(item.grades || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function AdminInventoryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesQuery(item, deferredSearch)),
    [items, deferredSearch],
  );

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

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
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

  if (loading) return <p className="catalog-status">Loading inventory…</p>;

  return (
    <div className="admin-inventory">
      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <label className="admin-inventory-search">
        <span className="sr-only">Search products</span>
        <input
          type="search"
          placeholder="Search by name, author, publisher, school…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {!loading && items.length > 0 ? (
        <p className="admin-inventory-count">
          {filteredItems.length} of {items.length} product
          {items.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="admin-empty">No inventory items yet.</p>
      ) : filteredItems.length === 0 ? (
        <p className="admin-empty">No products match “{deferredSearch}”.</p>
      ) : (
        <div className="admin-inventory-list">
          {filteredItems.map((item) => {
            const isEditing = editingId === item.id && draft;
            return (
              <article key={item.id} className="admin-inventory-card">
                <div className="admin-inventory-card-main">
                  <div
                    className="admin-inventory-thumb"
                    style={
                      item.image_url
                        ? { backgroundImage: `url(${item.image_url})` }
                        : {
                            backgroundImage: coverGradient(item.department),
                          }
                    }
                  />
                  <div className="admin-inventory-summary">
                    <h3>{item.name}</h3>
                    <p>
                      {item.department} · {formatPrice(item.price)} · stock{" "}
                      {item.stock}
                      {item.is_active ? "" : " · inactive"}
                    </p>
                    {item.author ? (
                      <p className="admin-muted">by {item.author}</p>
                    ) : null}
                    {item.publisher ? (
                      <p className="admin-muted">{item.publisher}</p>
                    ) : null}
                  </div>
                  <div className="admin-inventory-actions">
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busyId === item.id}
                      onClick={() =>
                        isEditing ? cancelEdit() : startEdit(item)
                      }
                    >
                      {isEditing ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busyId === item.id}
                      onClick={() => toggleActive(item)}
                    >
                      {item.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <form className="admin-inventory-form" onSubmit={saveEdit}>
                    <label className="admin-field">
                      <span>Name</span>
                      <input
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        required
                      />
                    </label>

                    <label className="admin-field">
                      <span>Department</span>
                      <select
                        value={draft.department}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            department: e.target.value as Department,
                          })
                        }
                      >
                        <option value="textbooks">Textbooks</option>
                        <option value="stationery">Stationery</option>
                        <option value="gifts">Gifts</option>
                      </select>
                    </label>

                    <div className="admin-inventory-form-row">
                      <label className="admin-field">
                        <span>Stock</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.quantity}
                          onChange={(e) =>
                            setDraft({ ...draft, quantity: e.target.value })
                          }
                          required
                        />
                      </label>
                      <label className="admin-field">
                        <span>Price</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.price}
                          onChange={(e) =>
                            setDraft({ ...draft, price: e.target.value })
                          }
                          required
                        />
                      </label>
                    </div>

                    <label className="admin-field">
                      <span>Author</span>
                      <input
                        value={draft.author}
                        onChange={(e) =>
                          setDraft({ ...draft, author: e.target.value })
                        }
                        placeholder="Author name"
                      />
                    </label>

                    <label className="admin-field">
                      <span>Publisher</span>
                      <input
                        value={draft.publisher}
                        onChange={(e) =>
                          setDraft({ ...draft, publisher: e.target.value })
                        }
                        placeholder="Publisher"
                      />
                    </label>

                    <label className="admin-field">
                      <span>Image URL</span>
                      <input
                        type="url"
                        value={draft.image_url}
                        onChange={(e) =>
                          setDraft({ ...draft, image_url: e.target.value })
                        }
                        placeholder="https://…"
                      />
                    </label>

                    {draft.image_url.trim() ? (
                      <div
                        className="admin-inventory-preview"
                        style={{
                          backgroundImage: `url(${draft.image_url.trim()})`,
                        }}
                        aria-label="Image preview"
                      />
                    ) : null}

                    <label className="admin-field">
                      <span>Description</span>
                      <textarea
                        rows={4}
                        value={draft.description}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                        placeholder="Product description"
                      />
                    </label>

                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) =>
                          setDraft({ ...draft, is_active: e.target.checked })
                        }
                      />
                      <span>Active in catalog</span>
                    </label>

                    <div className="admin-inventory-form-actions">
                      <button
                        type="submit"
                        className="admin-btn primary"
                        disabled={busyId === item.id}
                      >
                        {busyId === item.id ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        className="admin-btn"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
