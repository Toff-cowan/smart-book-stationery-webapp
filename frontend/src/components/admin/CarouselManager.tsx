"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import {
  ApiError,
  createAdminHeroSlide,
  deleteAdminHeroSlide,
  fetchAdminHeroSlides,
  updateAdminHeroSlide,
  uploadAdminHeroSlideImage,
  type HeroSlideRecord,
} from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { isOwner } from "@/lib/roles";

const FALLBACK_IMAGE = "/landing/hero-1.png";

type Draft = {
  subtitle: string;
  primary_label: string;
  primary_href: string;
  secondary_label: string;
  secondary_href: string;
  sort_order: number;
  is_active: boolean;
};

function toDraft(slide: HeroSlideRecord): Draft {
  return {
    subtitle: slide.subtitle,
    primary_label: slide.primary_label,
    primary_href: slide.primary_href,
    secondary_label: slide.secondary_label,
    secondary_href: slide.secondary_href,
    sort_order: slide.sort_order,
    is_active: slide.is_active,
  };
}

export function CarouselManager({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useAuth();
  const [slides, setSlides] = useState<HeroSlideRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function loadSlides() {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchAdminHeroSlides(token)
      .then((res) => {
        setSlides(res.data);
        const next: Record<number, Draft> = {};
        for (const slide of res.data) {
          next[slide.id] = toDraft(slide);
        }
        setDrafts(next);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load carousel slides",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token || !isOwner(user?.role)) return;
    loadSlides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  async function onSave(slideId: number) {
    if (!token) return;
    const draft = drafts[slideId];
    if (!draft) return;
    setBusyId(slideId);
    setError(null);
    setInfo(null);
    try {
      const res = await updateAdminHeroSlide(slideId, draft, token);
      setSlides((prev) =>
        prev.map((row) => (row.id === slideId ? res.data : row)),
      );
      setDrafts((prev) => ({ ...prev, [slideId]: toDraft(res.data) }));
      setInfo("Slide saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save slide");
    } finally {
      setBusyId(null);
    }
  }

  async function onUpload(slideId: number, file: File | null) {
    if (!token || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setBusyId(slideId);
    setError(null);
    setInfo(null);
    try {
      const res = await uploadAdminHeroSlideImage(slideId, file, token);
      setSlides((prev) =>
        prev.map((row) => (row.id === slideId ? res.data : row)),
      );
      setInfo("Carousel image updated.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not upload image",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(slideId: number) {
    if (!token) return;
    const ok = window.confirm("Delete this carousel slide?");
    if (!ok) return;
    setBusyId(slideId);
    setError(null);
    setInfo(null);
    try {
      await deleteAdminHeroSlide(slideId, token);
      setSlides((prev) => prev.filter((row) => row.id !== slideId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[slideId];
        return next;
      });
      setInfo("Slide deleted.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete slide",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const res = await createAdminHeroSlide(
        {
          subtitle: "",
          primary_label: "",
          primary_href: "",
          secondary_label: "",
          secondary_href: "",
          sort_order: slides.length,
          is_active: true,
        },
        token,
      );
      setSlides((prev) => [...prev, res.data]);
      setDrafts((prev) => ({ ...prev, [res.data.id]: toDraft(res.data) }));
      setInfo("Slide added. Upload an image — leave text/links blank to hide them.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create slide",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!isOwner(user?.role)) {
    return <p className="msg error">Owner access required.</p>;
  }

  if (loading) {
    return <p className="catalog-status">Loading carousel…</p>;
  }

  return (
    <section className={embedded ? "admin-carousel embedded" : "admin-carousel"}>
      {!embedded ? (
        <header className="admin-users-head">
          <div>
            <h2>Hero carousel</h2>
            <p>
              Upload carousel images. Leave subtitle blank to hide text; leave a
              button link blank to hide that button.
            </p>
          </div>
        </header>
      ) : (
        <div className="admin-panel-head">
          <h2>Carousel images</h2>
        </div>
      )}

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      <ul className="admin-carousel-list">
        {slides.map((slide) => {
          const draft = drafts[slide.id] || toDraft(slide);
          const preview =
            mediaUrl(slide.image_url) || FALLBACK_IMAGE;
          return (
            <li key={slide.id} className="admin-carousel-card">
              <div
                className="admin-carousel-preview"
                style={{ backgroundImage: `url(${preview})` }}
                role="img"
                aria-label={`Slide ${slide.id} preview`}
              />
              <div className="admin-carousel-fields">
                <div className="admin-field">
                  <span className="admin-field-label">Subtitle</span>
                  <textarea
                    rows={2}
                    value={draft.subtitle}
                    placeholder="Leave blank to hide text"
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [slide.id]: { ...draft, subtitle: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="admin-carousel-grid">
                  <div className="admin-field">
                    <span className="admin-field-label">Primary button</span>
                    <input
                      type="text"
                      value={draft.primary_label}
                      placeholder="Optional label"
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            primary_label: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="admin-field">
                    <span className="admin-field-label">Primary link</span>
                    <input
                      type="text"
                      value={draft.primary_href}
                      placeholder="Blank = hide button"
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            primary_href: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="admin-field">
                    <span className="admin-field-label">Secondary button</span>
                    <input
                      type="text"
                      value={draft.secondary_label}
                      placeholder="Optional label"
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            secondary_label: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="admin-field">
                    <span className="admin-field-label">Secondary link</span>
                    <input
                      type="text"
                      value={draft.secondary_href}
                      placeholder="Blank = hide button"
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            secondary_href: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="admin-field">
                    <span className="admin-field-label">Sort order</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.sort_order}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            sort_order: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                  <label className="admin-carousel-check">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            is_active: e.target.checked,
                          },
                        }))
                      }
                    />
                    Active on homepage
                  </label>
                </div>
                <div className="admin-carousel-actions">
                  <button
                    type="button"
                    className="admin-btn primary"
                    disabled={busyId === slide.id}
                    onClick={() => void onSave(slide.id)}
                  >
                    {busyId === slide.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn"
                    disabled={busyId === slide.id}
                    onClick={() => fileRefs.current[slide.id]?.click()}
                  >
                    Change image
                  </button>
                  <button
                    type="button"
                    className="admin-btn danger"
                    disabled={busyId === slide.id}
                    onClick={() => void onDelete(slide.id)}
                  >
                    Delete
                  </button>
                  <input
                    ref={(el) => {
                      fileRefs.current[slide.id] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      void onUpload(slide.id, e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={onCreate} className="admin-carousel-add">
        <button type="submit" className="admin-btn primary" disabled={creating}>
          {creating ? "Adding…" : "Add slide"}
        </button>
      </form>
    </section>
  );
}
