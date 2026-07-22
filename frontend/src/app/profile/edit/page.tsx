"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import { ApiError, updateProfile, uploadAvatar } from "@/lib/api";
import { mediaUrl } from "@/lib/format";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function EditProfilePage() {
  const { user, token, ready, setUser, refreshUser } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    void refreshUser().then((next) => {
      if (!next) return;
      setName(next.name || "");
      setEmail(next.email || "");
      setPhone(next.phone || "");
      setPreview(mediaUrl(next.avatar_url));
    });
  }, [ready, token, refreshUser]);

  useEffect(() => {
    if (!user) return;
    setName((prev) => prev || user.name || "");
    setEmail((prev) => prev || user.email || "");
    setPhone((prev) => prev || user.phone || "");
    setPreview((prev) => prev || mediaUrl(user.avatar_url));
  }, [user]);

  function onPickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (png, jpg, webp, or gif).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is too large (max 5 MB).");
      return;
    }
    setError(null);
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedEmail) {
      setError("Name and email are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      let nextUser = user;
      if (pendingFile) {
        const avatarRes = await uploadAvatar(pendingFile, token);
        nextUser = avatarRes.data;
        setPendingFile(null);
      }

      const profileRes = await updateProfile(
        {
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone || null,
        },
        token,
      );
      nextUser = profileRes.data;
      setUser(nextUser);
      setPreview(mediaUrl(nextUser.avatar_url));
      setInfo("Profile updated.");
      router.push("/profile");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update profile",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="catalog-status">Loading…</p>;
  }

  if (!token || !user) {
    return (
      <section className="customer-profile">
        <h1>Edit profile</h1>
        <p className="customer-profile-lead">
          <Link href={`/login?next=${encodeURIComponent("/profile/edit")}`}>
            Sign in
          </Link>{" "}
          to update your account.
        </p>
      </section>
    );
  }

  return (
    <section className="customer-profile customer-profile-edit">
      <header className="customer-profile-edit-head">
        <div>
          <p className="customer-profile-kicker">
            <Link href="/profile">← Back to profile</Link>
          </p>
          <h1>Edit profile</h1>
          <p className="customer-profile-lead">
            Update your photo, name, phone number, and email used for bookstore
            notifications.
          </p>
        </div>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <form className="auth-form customer-profile-form" onSubmit={onSubmit}>
        <div className="customer-profile-photo-field">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="customer-profile-avatar" />
          ) : (
            <div className="customer-profile-avatar initials" aria-hidden>
              {initials(name || user.name)}
            </div>
          )}
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {preview ? "Change photo" : "Add photo"}
            </button>
            <p className="customer-profile-hint">
              PNG, JPG, WEBP, or GIF · max 5 MB
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
          />
        </div>

        <label>
          Full name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            maxLength={120}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Phone number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="e.g. 876-555-0100"
            maxLength={40}
          />
        </label>

        <div className="customer-profile-form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <Link href="/profile" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
