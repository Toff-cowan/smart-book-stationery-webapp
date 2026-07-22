"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  ApiError,
  broadcastAdminNewsletter,
  fetchAdminNewsletterSubscribers,
  type NewsletterSubscriber,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isOwner } from "@/lib/roles";

export default function AdminNewsletterPage() {
  const { token, user } = useAuth();
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeCustomers, setIncludeCustomers] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token || !isOwner(user?.role)) return;
    let cancelled = false;
    setLoading(true);
    fetchAdminNewsletterSubscribers(token)
      .then((res) => {
        if (!cancelled) setSubscribers(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load subscribers",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

  async function onBroadcast(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!subject.trim() || !message.trim()) {
      setError("Subject and message are required.");
      return;
    }

    const audience = includeCustomers
      ? `${subscribers.length} subscriber(s) plus registered customers`
      : `${subscribers.length} mailing-list subscriber(s)`;
    const ok = window.confirm(
      `Send this store update to ${audience}?`,
    );
    if (!ok) return;

    setSending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await broadcastAdminNewsletter(
        {
          subject: subject.trim(),
          message: message.trim(),
          include_registered_customers: includeCustomers,
          image,
        },
        token,
      );
      setInfo(res.message || "Update sent.");
      setSubject("");
      setMessage("");
      setImage(null);
      setImagePreview(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send update",
      );
    } finally {
      setSending(false);
    }
  }

  if (!isOwner(user?.role)) {
    return <p className="msg error">Owner access required.</p>;
  }

  return (
    <div className="admin-newsletter">
      <header className="admin-users-head">
        <div>
          <h2>Store updates</h2>
          <p>
            Email everyone on the mailing list. New subscribers receive a
            confirmation email when they sign up on the homepage.
          </p>
        </div>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Compose update</h2>
        </div>
        <form className="admin-newsletter-form" onSubmit={onBroadcast}>
          <label>
            Subject
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. New term stock is in"
            />
          </label>
          <label>
            Message
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={10000}
              required
              placeholder="Write your store update…"
            />
          </label>
          <label>
            Image (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && file.size > 5 * 1024 * 1024) {
                  setError("Image is too large (max 5 MB).");
                  e.target.value = "";
                  return;
                }
                setError(null);
                setImage(file);
                setImagePreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          {imagePreview ? (
            <div className="admin-newsletter-image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Update preview" />
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setImage(null);
                  setImagePreview(null);
                }}
              >
                Remove image
              </button>
            </div>
          ) : null}
          <label className="admin-newsletter-check">
            <input
              type="checkbox"
              checked={includeCustomers}
              onChange={(e) => setIncludeCustomers(e.target.checked)}
            />
            Also email registered customer accounts
          </label>
          <button type="submit" className="admin-btn primary" disabled={sending}>
            {sending ? "Sending…" : "Send store update"}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>
            Mailing list
            {!loading ? ` (${subscribers.length})` : ""}
          </h2>
        </div>
        {loading ? (
          <p className="catalog-status">Loading subscribers…</p>
        ) : subscribers.length === 0 ? (
          <p className="admin-empty">No subscribers yet.</p>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
