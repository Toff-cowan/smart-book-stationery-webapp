"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  fetchAdminInventory,
  updateAdminInventoryItem,
} from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

export default function AdminInventoryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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

  async function saveItem(item: InventoryItem, patch: { quantity?: number; price?: number; is_active?: boolean }) {
    if (!token) return;
    setBusyId(item.id);
    setError(null);
    setInfo(null);
    try {
      const res = await updateAdminInventoryItem(item.id, patch, token);
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

      {items.length === 0 ? (
        <p className="admin-empty">No inventory items yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Stock</th>
              <th>Price</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.department}</td>
                <td>
                  <input
                    className="admin-inline-input"
                    type="number"
                    min={0}
                    defaultValue={item.stock}
                    id={`stock-${item.id}`}
                  />
                </td>
                <td>
                  <input
                    className="admin-inline-input"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={item.price}
                    id={`price-${item.id}`}
                  />
                </td>
                <td>{item.is_active ? "Yes" : "No"}</td>
                <td className="admin-inventory-actions">
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={busyId === item.id}
                    onClick={() => {
                      const stockEl = document.getElementById(
                        `stock-${item.id}`,
                      ) as HTMLInputElement | null;
                      const priceEl = document.getElementById(
                        `price-${item.id}`,
                      ) as HTMLInputElement | null;
                      saveItem(item, {
                        quantity: Number(stockEl?.value ?? item.stock),
                        price: Number(priceEl?.value ?? item.price),
                      });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={busyId === item.id}
                    onClick={() =>
                      saveItem(item, { is_active: !item.is_active })
                    }
                  >
                    {item.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <span className="admin-muted">{formatPrice(item.price)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
