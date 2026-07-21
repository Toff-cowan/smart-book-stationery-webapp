"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  ApiError,
  fetchAdminOrder,
  notifyAdminOrderCustomer,
  updateAdminOrderStatus,
  type AdminOrder,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

const STATUSES = [
  "submitted",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
] as const;

export default function AdminOrderDetailPage() {
  const { token } = useAuth();
  const params = useParams();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [status, setStatus] = useState("submitted");
  const [message, setMessage] = useState("");
  const [confirmedTotal, setConfirmedTotal] = useState("");
  const [readyAt, setReadyAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !orderId) return;
    let cancelled = false;
    setLoading(true);
    fetchAdminOrder(orderId, token)
      .then((res) => {
        if (cancelled) return;
        setOrder(res.data);
        setStatus(res.data.status);
        setConfirmedTotal(
          res.data.grand_total != null ? String(res.data.grand_total) : "",
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load order",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderId]);

  async function saveStatus() {
    if (!token || !order) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await updateAdminOrderStatus(order.id, status, token);
      setOrder(res.data);
      setInfo("Status updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  async function sendCustomer(e: FormEvent) {
    e.preventDefault();
    if (!token || !order) return;
    if (!message.trim()) {
      setError("Enter a message for the customer.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload: {
        message: string;
        confirmed_total?: number;
        ready_at?: string;
      } = { message: message.trim() };
      const total = Number(confirmedTotal);
      if (confirmedTotal.trim() && !Number.isNaN(total)) {
        payload.confirmed_total = total;
      }
      if (readyAt.trim()) payload.ready_at = readyAt.trim();

      const res = await notifyAdminOrderCustomer(order.id, payload, token);
      setInfo(res.message || "Customer notified.");
      setMessage("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not notify customer",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="catalog-status">Loading order…</p>;
  if (!order) {
    return (
      <p className="msg error">{error || "Order not found."}</p>
    );
  }

  return (
    <div className="admin-order-detail">
      <Link href="/admin/orders" className="admin-back">
        ← All orders
      </Link>

      <header className="admin-detail-head">
        <div>
          <h2>Order #{order.id}</h2>
          <p>
            {order.customer?.name}
            {" · "}
            {order.customer?.contact_email ||
              order.contact_email ||
              order.customer?.email}
            {order.customer?.contact_phone || order.contact_phone
              ? ` · ${order.customer?.contact_phone || order.contact_phone}`
              : null}
          </p>
        </div>
        <span className={`admin-status ${order.status}`}>{order.status}</span>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h3>Order details</h3>
          <dl className="admin-dl">
            <div>
              <dt>Submitted</dt>
              <dd>
                {order.submitted_at
                  ? new Date(order.submitted_at).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Fulfillment</dt>
              <dd>{order.fulfillment_type || "pickup"}</dd>
            </div>
            <div>
              <dt>Listed total</dt>
              <dd>
                <Price value={order.grand_total} />
              </dd>
            </div>
            <div>
              <dt>Notify email</dt>
              <dd>
                {order.contact_email ||
                  order.customer?.contact_email ||
                  order.customer?.email ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                {order.contact_phone ||
                  order.customer?.contact_phone ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt>Customer notes</dt>
              <dd>{order.notes || "—"}</dd>
            </div>
          </dl>

          <h3>Line items</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <Price value={item.unit_price} />
                  </td>
                  <td>
                    <Price value={item.line_total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="admin-detail-actions">
          <section className="admin-panel">
            <h3>Update status</h3>
            <label className="admin-field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={saveStatus}
            >
              Save status
            </button>
          </section>

          <section className="admin-panel">
            <h3>Notify customer</h3>
            <p className="admin-help">
              Emails{" "}
              {order.contact_email ||
                order.customer?.contact_email ||
                order.customer?.email ||
                "the customer"}
              {order.contact_phone || order.customer?.contact_phone
                ? ` (phone on file: ${order.contact_phone || order.customer?.contact_phone})`
                : ""}
              . Include availability, confirmed total, and pickup timing.
            </p>
            <form className="admin-notify-form" onSubmit={sendCustomer}>
              <label className="admin-field">
                <span>Message</span>
                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="We have these items in stock…"
                  required
                />
              </label>
              <label className="admin-field">
                <span>Confirmed total</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={confirmedTotal}
                  onChange={(e) => setConfirmedTotal(e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>Ready for pickup</span>
                <input
                  type="text"
                  value={readyAt}
                  onChange={(e) => setReadyAt(e.target.value)}
                  placeholder="Tomorrow after 2pm"
                />
              </label>
              <button type="submit" className="admin-btn primary" disabled={busy}>
                {busy ? "Sending…" : "Send to customer"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
