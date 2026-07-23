"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  ApiError,
  addToCartBulk,
  fetchGrades,
  matchBooklistTitles,
  scanBooklistImage,
  type BookMatchResult,
  type OcrTitleLine,
} from "@/lib/api";
import type { GradeFilter, InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

type Step = "capture" | "titles" | "select";

function newManualLine(): OcrTitleLine {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    title: "",
    author: "",
    confidence: 100,
  };
}

export default function BooklistScanPage() {
  const router = useRouter();
  const { token, ready } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lines, setLines] = useState<OcrTitleLine[]>([]);

  const [grade, setGrade] = useState("");
  const [grades, setGrades] = useState<GradeFilter[]>([]);

  const [matchResults, setMatchResults] = useState<BookMatchResult[]>([]);
  const [catalog, setCatalog] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Which catalog product was chosen for each scanned title. */
  const [picks, setPicks] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchGrades()
      .then((res) => setGrades(res.data))
      .catch(() => setGrades([]));
  }, []);

  const selectedItems = useMemo(() => {
    const byId = new Map<number, InventoryItem>();
    for (const item of catalog) byId.set(item.id, item);
    for (const result of matchResults) {
      const hit = result.match || result.suggestions[0];
      if (hit) {
        byId.set(hit.product_id, {
          id: hit.product_id,
          name: hit.name,
          author: hit.author,
          price: hit.price,
          stock: hit.stock,
          quantity: hit.stock,
          department: "textbooks",
          publisher: null,
          vendor: null,
          isbn: null,
          rating_stars: null,
          rating_count: 0,
          image_url: null,
          is_active: true,
          category_id: null,
          school: hit.school,
          grades: hit.grades,
          description: null,
        });
      }
    }
    return Array.from(selected)
      .map((id) => byId.get(id))
      .filter(Boolean) as InventoryItem[];
  }, [selected, catalog, matchResults]);

  async function onPickImage(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await scanBooklistImage(file);
      setLines(
        res.data.lines.length
          ? res.data.lines.map((line) => ({
              ...line,
              text: line.title || line.text,
              title: line.title || line.text,
              author: line.author ?? "",
            }))
          : [newManualLine()],
      );
      setPreview(
        res.data.preview_jpeg_base64
          ? `data:image/jpeg;base64,${res.data.preview_jpeg_base64}`
          : null,
      );
      if (res.data.grade && !grade) {
        setGrade(res.data.grade);
      }
      setInfo(res.data.message);
      setStep("titles");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not scan this photo. You can still enter titles manually.",
      );
      setLines([newManualLine()]);
      setPreview(null);
      setStep("titles");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    void onPickImage(file);
  }

  function updateLine(
    id: string,
    patch: Partial<Pick<OcrTitleLine, "text" | "title" | "author">>,
  ) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        if (patch.text != null && patch.title == null) {
          next.title = patch.text;
        }
        if (patch.title != null && patch.text == null) {
          next.text = patch.title;
        }
        return next;
      }),
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((line) => line.id !== id));
  }

  async function runMatch() {
    const titles = lines
      .map((l) => ({
        text: (l.title || l.text).trim(),
        author: (l.author || "").trim() || null,
      }))
      .filter((l) => l.text);
    if (titles.length === 0) {
      setError("Add at least one title before matching.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await matchBooklistTitles({
        grade: grade || null,
        titles,
      });
      setMatchResults(res.data.results);
      setCatalog(res.data.catalog);
      const next = new Set<number>();
      const nextPicks: Record<string, number> = {};
      for (const result of res.data.results) {
        if (result.status === "matched" && result.match) {
          next.add(result.match.product_id);
          nextPicks[result.query] = result.match.product_id;
        }
      }
      setSelected(next);
      setPicks(nextPicks);
      const matched = res.data.results.filter((r) => r.status === "matched").length;
      setInfo(
        `Matched ${matched} of ${res.data.results.length} title(s)${
          grade ? ` · filtered by ${grade}` : ""
        }.`,
      );
      setStep("select");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  function optionsForResult(result: BookMatchResult) {
    const list = [...result.suggestions];
    if (result.match && !list.some((s) => s.product_id === result.match!.product_id)) {
      list.unshift(result.match);
    }
    return list.slice(0, 5);
  }

  function chooseOption(query: string, productId: number, siblingIds: number[]) {
    setPicks((prev) => ({ ...prev, [query]: productId }));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of siblingIds) next.delete(id);
      next.add(productId);
      return next;
    });
    setInfo(`Selected option for “${query}”.`);
  }

  function clearPick(query: string, siblingIds: number[]) {
    setPicks((prev) => {
      const next = { ...prev };
      delete next[query];
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of siblingIds) next.delete(id);
      return next;
    });
  }

  function toggleProduct(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAvailable() {
    const next = new Set<number>();
    const nextPicks: Record<string, number> = { ...picks };
    for (const item of catalog) {
      next.add(item.id);
    }
    for (const result of matchResults) {
      const options = optionsForResult(result);
      const chosen =
        picks[result.query] ??
        result.match?.product_id ??
        options[0]?.product_id;
      if (chosen) {
        next.add(chosen);
        nextPicks[result.query] = chosen;
      }
    }
    setSelected(next);
    setPicks(nextPicks);
  }

  async function addSelectedAndGoToCart() {
    if (!ready) return;
    if (!token) {
      router.push(`/login?next=${encodeURIComponent("/booklist/scan")}`);
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one book.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const items = Array.from(selected).map((product_id) => ({
        product_id,
        quantity: 1,
      }));
      const res = await addToCartBulk(items, token);
      if (!res.added) {
        const reasons = (res.skipped || [])
          .map((s) => s.name || s.reason)
          .filter(Boolean)
          .slice(0, 3);
        setError(
          reasons.length
            ? `Nothing was added to cart (${reasons.join("; ")}).`
            : res.message || "Nothing was added to cart.",
        );
        return;
      }
      const skippedNote =
        res.skipped?.length
          ? ` (${res.skipped.length} skipped)`
          : "";
      setInfo(`${res.message || `Added ${res.added} item(s).`}${skippedNote}`);
      router.push("/cart");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update cart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan-page">
      <header className="scan-head">
        <p className="scan-kicker">Booklists</p>
        <h1>Scan your booklist</h1>
        <p>
          Take a photo of your list, confirm the titles, then pick the matching
          books to add to your cart.
        </p>
        <ol className="scan-steps" aria-label="Progress">
          {(
            [
              ["capture", "Photo"],
              ["titles", "Titles"],
              ["select", "Select"],
            ] as const
          ).map(([key, label]) => (
            <li key={key} className={step === key ? "active" : undefined}>
              {label}
            </li>
          ))}
        </ol>
      </header>

      {error ? <p className="msg error">{error}</p> : null}
      {info ? <p className="msg ok">{info}</p> : null}

      {step === "capture" ? (
        <section className="scan-panel">
          <h2>Capture or upload</h2>
          <p className="scan-lead">
            Use your phone camera for best results. We’ll read the titles
            automatically with AI.
          </p>
          <p className="scan-accuracy-note" role="note">
            Please double-check every title and author after scanning. AI can
            misread names, miss books, or mix up editions — only add books you
            have verified against your list.
          </p>
          {busy ? (
            <div className="scan-loading" role="status" aria-live="polite">
              <span className="loader" aria-hidden="true" />
              <p>Scanning your booklist…</p>
              <p className="scan-loading-hint">
                Gemini is reading titles and authors from your photo
              </p>
            </div>
          ) : (
            <div className="scan-capture-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => cameraRef.current?.click()}
              >
                Open camera
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileRef.current?.click()}
              >
                Upload photo
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setLines([newManualLine()]);
                  setPreview(null);
                  setStep("titles");
                }}
              >
                Enter titles manually
              </button>
            </div>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="sr-only"
            onChange={onFileChange}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={onFileChange}
          />
        </section>
      ) : null}

      {step === "titles" ? (
        <section className="scan-panel">
          <h2>Confirm extracted titles</h2>
          <p className="scan-lead">
            We filter out headings, prices, and stationery. Edit any incorrect
            book title or author before searching inventory.
          </p>
          <p className="scan-accuracy-note" role="note">
            Carefully review this list against your printed booklist before
            continuing. Do not rely on the scan alone.
          </p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Corrected booklist preview"
              className="scan-preview"
            />
          ) : null}
          <ul className="scan-title-list">
            {lines.map((line) => (
              <li key={line.id} className="scan-title-row">
                <div className="scan-title-fields">
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={line.title || line.text}
                      onChange={(e) =>
                        updateLine(line.id, {
                          title: e.target.value,
                          text: e.target.value,
                        })
                      }
                      placeholder="Book title"
                    />
                  </label>
                  <label>
                    <span>Author</span>
                    <input
                      type="text"
                      value={line.author || ""}
                      onChange={(e) =>
                        updateLine(line.id, { author: e.target.value })
                      }
                      placeholder="Author (if known)"
                    />
                  </label>
                </div>
                <span
                  className={
                    line.confidence >= 85
                      ? "scan-conf high"
                      : line.confidence >= 60
                        ? "scan-conf mid"
                        : "scan-conf low"
                  }
                  title="OCR confidence"
                >
                  {Math.round(line.confidence)}%
                </span>
                <button
                  type="button"
                  className="scan-remove"
                  onClick={() => removeLine(line.id)}
                  aria-label="Remove title"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <label className="scan-field">
            <span>Grade / form (optional)</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
          </label>
          <div className="scan-inline-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setLines((prev) => [...prev, newManualLine()])}
            >
              Add title
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep("capture")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void runMatch()}
            >
              {busy ? "Matching…" : "Find books"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "select" ? (
        <section className="scan-panel">
          <h2>Select books</h2>
          <p className="scan-lead">
            Confirmed matches are selected for you. Where we are unsure, pick the
            correct book from the options.
          </p>

          {matchResults.length > 0 ? (
            <div className="scan-match-block">
              <h3>From your scanned titles</h3>
              <ul className="scan-match-list">
                {matchResults.map((result, index) => {
                  const options = optionsForResult(result);
                  const siblingIds = options.map((o) => o.product_id);
                  const chosenId = picks[result.query];
                  const groupName = `scan-pick-${index}`;
                  const needsPick = result.status !== "matched" || !result.match;

                  return (
                    <li
                      key={`${result.query}-${index}`}
                      className={`scan-match ${result.status}`}
                    >
                      <p className="scan-match-query">“{result.query}”</p>
                      {result.author ? (
                        <p className="scan-match-author">
                          Author hint: {result.author}
                        </p>
                      ) : null}

                      {!needsPick && result.match ? (
                        <>
                          <label className="scan-check-row">
                            <input
                              type="checkbox"
                              checked={selected.has(result.match.product_id)}
                              onChange={() =>
                                toggleProduct(result.match!.product_id)
                              }
                            />
                            <span>
                              <strong>{result.match.name}</strong>
                              {result.match.author
                                ? ` · ${result.match.author}`
                                : ""}
                              {" · "}
                              <Price value={result.match.price} />
                              <span className="scan-conf-inline">
                                {Math.round(result.match.confidence)}% match
                              </span>
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          {result.message ? (
                            <p className="scan-match-hint">{result.message}</p>
                          ) : (
                            <p className="scan-match-hint">
                              Pick the correct book from the options below.
                            </p>
                          )}
                          {options.length > 0 ? (
                            <ul
                              className="scan-suggestions"
                              role="radiogroup"
                              aria-label={`Options for ${result.query}`}
                            >
                              {options.map((s) => {
                                const checked = chosenId === s.product_id;
                                return (
                                  <li key={`${result.query}-${s.product_id}`}>
                                    <label
                                      className={
                                        checked
                                          ? "scan-option-row selected"
                                          : "scan-option-row"
                                      }
                                    >
                                      <input
                                        type="radio"
                                        name={groupName}
                                        checked={checked}
                                        onChange={() =>
                                          chooseOption(
                                            result.query,
                                            s.product_id,
                                            siblingIds,
                                          )
                                        }
                                      />
                                      <span className="scan-option-body">
                                        <strong className="scan-option-name">
                                          {s.name}
                                        </strong>
                                        <span className="scan-option-meta">
                                          {s.author ? `${s.author} · ` : null}
                                          <Price value={s.price} />
                                          <span className="scan-conf-inline">
                                            {Math.round(s.confidence)}% match
                                          </span>
                                        </span>
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="scan-lead">
                              No catalog suggestions for this title.
                            </p>
                          )}
                          {chosenId ? (
                            <button
                              type="button"
                              className="scan-clear-pick"
                              onClick={() =>
                                clearPick(result.query, siblingIds)
                              }
                            >
                              Clear selection
                            </button>
                          ) : null}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {catalog.length > 0 ? (
            <div className="scan-match-block">
              <div className="scan-catalog-head">
                <h3>
                  {grade ? `${grade} books` : "Related books"}
                </h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={selectAllAvailable}
                >
                  Select all available
                </button>
              </div>
              <ul className="scan-catalog-list">
                {catalog.map((item) => (
                  <li key={item.id}>
                    <label className="scan-check-row">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleProduct(item.id)}
                      />
                      <span>
                        <strong>{item.name}</strong>
                        {item.author ? ` · ${item.author}` : ""}
                        {" · "}
                        <Price value={item.price} />
                        <span className="scan-stock">
                          {item.stock > 0
                            ? `${item.stock} in stock`
                            : "Check availability with store"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="scan-inline-actions" style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={selectAllAvailable}
              >
                Select all matched
              </button>
            </div>
          )}

          <div className="scan-footer-bar">
            <p>
              {selected.size} selected
              {selectedItems.length ? ` · est. ` : null}
              {selectedItems.length ? (
                <Price
                  value={selectedItems.reduce((sum, i) => sum + i.price, 0)}
                />
              ) : null}
            </p>
            <div className="scan-inline-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep("titles")}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || selected.size === 0}
                onClick={() => void addSelectedAndGoToCart()}
              >
                {busy
                  ? "Adding…"
                  : token
                    ? "Add selected & go to cart"
                    : "Sign in to add to cart"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <p className="scan-alt">
        Prefer browsing? <Link href="/catalog">Catalog</Link>
      </p>
    </div>
  );
}
