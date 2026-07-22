"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  createAdminStaffUser,
  deleteAdminStaffUser,
  fetchAdminUsers,
  type AdminUser,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isOwner, isStaff, roleLabel } from "@/lib/roles";

function formatWhen(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function AdminUsersPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<"all" | "customer" | "staff">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "owner">("employee");

  function loadUsers() {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAdminUsers(token)
      .then((res) => setUsers(res.data))
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : "Could not load users",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token || !isOwner(user?.role)) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  const filtered = useMemo(() => {
    if (filter === "customer") {
      return users.filter((row) => row.role === "customer");
    }
    if (filter === "staff") {
      return users.filter((row) => isStaff(row.role));
    }
    return users;
  }, [users, filter]);

  const ownerCount = useMemo(
    () => users.filter((row) => isOwner(row.role)).length,
    [users],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || password.length < 8) {
      setError("Name, email, and a password of at least 8 characters are required.");
      return;
    }

    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const res = await createAdminStaffUser(
        {
          name: trimmedName,
          email: trimmedEmail,
          password,
          role,
        },
        token,
      );
      setInfo(res.message || "Staff account saved.");
      setName("");
      setEmail("");
      setPassword("");
      setRole("employee");
      setUsers((prev) => {
        const without = prev.filter((row) => row.id !== res.data.id);
        return [res.data, ...without];
      });
      setFilter("staff");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create staff account",
      );
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(row: AdminUser) {
    if (!token || !user) return;
    if (row.id === user.id) {
      setError("You cannot delete your own account.");
      return;
    }
    if (!isStaff(row.role)) return;

    const label = roleLabel(row.role).toLowerCase();
    const ok = window.confirm(
      `Delete ${label} ${row.name} (${row.email})? They will lose admin access immediately.`,
    );
    if (!ok) return;

    setBusyId(row.id);
    setError(null);
    setInfo(null);
    try {
      const res = await deleteAdminStaffUser(row.id, token);
      setUsers((prev) => prev.filter((u) => u.id !== row.id));
      setInfo(res.message || "Staff account deleted.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete account",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!isOwner(user?.role)) {
    return <p className="msg error">Owner access required.</p>;
  }

  if (loading && users.length === 0) {
    return <p className="catalog-status">Loading users…</p>;
  }

  return (
    <div className="admin-users">
      <header className="admin-users-head">
        <div>
          <h2>Registered users</h2>
          <p>
            Add employees or other owners, and remove staff accounts. Customers
            stay in this list for reference but are not deleted here.
          </p>
        </div>
        <div className="admin-users-filters" role="tablist" aria-label="Filter users">
          {(
            [
              ["all", "All"],
              ["customer", "Customers"],
              ["staff", "Staff"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={
                filter === key
                  ? "admin-users-filter active"
                  : "admin-users-filter"
              }
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <section className="admin-panel admin-users-create">
        <div className="admin-panel-head">
          <h2>Add staff</h2>
        </div>
        <form className="admin-users-form" onSubmit={onCreate}>
          <label>
            Full name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="off"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value === "owner" ? "owner" : "employee")
              }
            >
              <option value="employee">Employee</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <button type="submit" className="admin-btn" disabled={creating}>
            {creating ? "Saving…" : "Add account"}
          </button>
        </form>
        <p className="admin-users-form-hint">
          Employees can manage orders and inventory. Owners also see revenue and
          this users list. If the email already belongs to a customer, they are
          promoted to staff.
        </p>
      </section>

      {filtered.length === 0 ? (
        <p className="catalog-status">No users in this filter.</p>
      ) : (
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Last login</th>
                <th>Last admin portal login</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const staff = isStaff(row.role);
                const canDelete =
                  staff &&
                  row.id !== user?.id &&
                  !(isOwner(row.role) && ownerCount <= 1);
                return (
                  <tr key={row.id}>
                    <td>
                      {row.name}
                      {row.id === user?.id ? (
                        <span className="admin-users-you"> (you)</span>
                      ) : null}
                    </td>
                    <td>{row.email}</td>
                    <td>
                      <span className={`admin-role-pill ${row.role}`}>
                        {roleLabel(row.role)}
                      </span>
                    </td>
                    <td>{row.phone || "—"}</td>
                    <td>{formatWhen(row.last_login_at)}</td>
                    <td>{staff ? formatWhen(row.last_admin_login_at) : "—"}</td>
                    <td>{formatWhen(row.created_at)}</td>
                    <td>
                      {canDelete ? (
                        <button
                          type="button"
                          className="admin-users-delete"
                          disabled={busyId === row.id}
                          onClick={() => void onDelete(row)}
                        >
                          {busyId === row.id ? "Deleting…" : "Delete"}
                        </button>
                      ) : staff && row.id === user?.id ? (
                        <span className="admin-users-muted">Current user</span>
                      ) : staff && isOwner(row.role) && ownerCount <= 1 ? (
                        <span className="admin-users-muted">Last owner</span>
                      ) : (
                        <span className="admin-users-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
