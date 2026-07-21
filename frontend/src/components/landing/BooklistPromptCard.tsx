"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

import { ApiError, fetchBooklistSchools, uploadBooklistFile } from "@/lib/api";
import type { BooklistSchool } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.txt,.csv,application/pdf,image/*";

export function BooklistPromptCard() {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [schools, setSchools] = useState<BooklistSchool[]>([]);
  const [searching, setSearching] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    fetchBooklistSchools(deferredQuery || undefined)
      .then((res) => {
        if (!cancelled) setSchools(res.data);
      })
      .catch(() => {
        if (!cancelled) setSchools([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  function openUpload(prefill?: string) {
    setShowUpload(true);
    if (prefill?.trim()) setSchoolName(prefill.trim());
    else if (query.trim() && !schoolName) setSchoolName(query.trim());
    setStatus("idle");
    setMessage(null);
  }

  function pickFile(next: File | null) {
    setFile(next);
    setStatus("idle");
    setMessage(null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const school = schoolName.trim();
    if (!school) {
      setMessage("Enter your school name.");
      setStatus("error");
      return;
    }
    if (!file) {
      setMessage("Choose a file to upload.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setMessage(null);
    try {
      const res = await uploadBooklistFile(file, {
        school,
        token: token ?? undefined,
      });
      setStatus("done");
      setMessage(res.message || "Uploaded successfully.");
      setFile(null);
      setSchoolName("");
      setQuery("");
      if (inputRef.current) inputRef.current.value = "";
      const refreshed = await fetchBooklistSchools();
      setSchools(refreshed.data);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof ApiError ? err.message : "Upload failed. Try again.",
      );
    }
  }

  const exactMatch = schools.some(
    (s) => s.name.toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <section className="booklist-prompt-section">
      <div className="booklist-prompt-inner">
        <div className="booklist-prompt-card">
          <p className="booklist-prompt-kicker">School booklists</p>
          <h2>Find your school list</h2>
          <p>
            Search for a school that already has a booklist. If yours is not
            listed, upload it — no account needed.
          </p>

          <label className="booklist-school-search">
            <span className="filter-label">Search schools</span>
            <input
              type="search"
              placeholder="e.g. Campion College"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="organization"
            />
          </label>

          <div className="booklist-school-results" aria-live="polite">
            {searching ? (
              <p className="booklist-drop-hint">Searching…</p>
            ) : schools.length > 0 ? (
              <ul>
                {schools.map((s) => (
                  <li key={s.name}>
                    <Link
                      href={`/catalog?school=${encodeURIComponent(s.name)}`}
                      className="booklist-school-link"
                    >
                      <span>{s.name}</span>
                      <span className="booklist-school-meta">
                        {s.product_count > 0
                          ? `${s.product_count} item${s.product_count === 1 ? "" : "s"}`
                          : "List submitted"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : deferredQuery ? (
              <p className="booklist-drop-hint">
                No school list matches “{deferredQuery}”.
              </p>
            ) : (
              <p className="booklist-drop-hint">
                Type a school name to see available lists.
              </p>
            )}
          </div>

          {!exactMatch ? (
            <div className="booklist-upload-gate">
              {!showUpload ? (
                <button
                  type="button"
                  className="booklist-browse-btn"
                  onClick={() => openUpload(query)}
                >
                  Don’t see your school? Upload a booklist
                </button>
              ) : (
                <form className="booklist-upload-form" onSubmit={onSubmit}>
                  <h3>Upload your school booklist</h3>
                  <p className="booklist-drop-hint">
                    Sign-in is optional. The bookstore will review your file.
                  </p>

                  <label className="booklist-school-search">
                    <span className="filter-label">School name</span>
                    <input
                      type="text"
                      placeholder="Your school"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      required
                    />
                  </label>

                  <div
                    className={
                      dragging
                        ? "booklist-dropzone dragging"
                        : "booklist-dropzone"
                    }
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept={ACCEPT}
                      className="booklist-file-input"
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="booklist-drop-label">
                      {file
                        ? file.name
                        : "Drag & drop a file here, or click to browse"}
                    </p>
                    <p className="booklist-drop-hint">
                      PDF, image, Word, TXT, or CSV · max 8 MB
                    </p>
                    <button
                      type="button"
                      className="booklist-browse-btn"
                      onClick={() => inputRef.current?.click()}
                    >
                      Choose file
                    </button>
                  </div>

                  {message ? (
                    <p className={status === "error" ? "msg error" : "msg ok"}>
                      {message}
                    </p>
                  ) : null}

                  <div className="booklist-prompt-actions">
                    <button
                      type="submit"
                      className="hero-shop-btn booklist-upload-btn"
                      disabled={status === "uploading"}
                    >
                      {status === "uploading" ? "Uploading…" : "Upload booklist"}
                    </button>
                    <button
                      type="button"
                      className="booklist-prompt-cta"
                      onClick={() => {
                        setShowUpload(false);
                        setMessage(null);
                        setStatus("idle");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          <div className="booklist-prompt-actions">
            <Link href="/catalog" className="booklist-prompt-cta">
              Or browse the full catalog →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
