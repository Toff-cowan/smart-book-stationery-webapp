"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";

import { ApiError, uploadBooklistFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.txt,.csv,application/pdf,image/*";

export function BooklistPromptCard() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

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
    if (!file) {
      setMessage("Choose a file to upload.");
      setStatus("error");
      return;
    }
    if (!ready) return;
    if (!token) {
      router.push("/login?next=/");
      return;
    }

    setStatus("uploading");
    setMessage(null);
    try {
      const res = await uploadBooklistFile(file, token);
      setStatus("done");
      setMessage(res.message || "Uploaded successfully.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof ApiError ? err.message : "Upload failed. Try again.",
      );
    }
  }

  return (
    <section className="booklist-prompt-section">
      <div className="booklist-prompt-inner">
        <form className="booklist-prompt-card" onSubmit={onSubmit}>
          <p className="booklist-prompt-kicker">Submit your booklist</p>
          <h2>Upload your school list</h2>
          <p>
            Drop a PDF, photo, or document of your booklist. The bookstore will
            review it and help you get everything ready for pickup.
          </p>

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
              {status === "uploading"
                ? "Uploading…"
                : token
                  ? "Upload booklist"
                  : "Sign in to upload"}
            </button>
            <Link href="/catalog" className="booklist-prompt-cta">
              Or browse the catalog →
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
