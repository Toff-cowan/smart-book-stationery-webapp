"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  ApiError,
  addToCartBulk,
  fetchBooklistSchools,
  fetchGrades,
  matchBooklistTitles,
  scanBooklistImage,
  type BookMatchResult,
  type OcrTitleLine,
} from "@/lib/api";
import type { BooklistSchool, GradeFilter, InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";

type Step = "capture" | "titles" | "school" | "select";

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

  const [schoolQuery, setSchoolQuery] = useState("");
  const deferredSchool = useDeferredValue(schoolQuery.trim());
  const [schools, setSchools] = useState<BooklistSchool[]>([]);
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [grades, setGrades] = useState<GradeFilter[]>([]);

  const [matchResults, setMatchResults] = useState<BookMatchResult[]>([]);
  const [catalog, setCatalog] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchGrades()
      .then((res) => setGrades(res.data))
      .catch(() => setGrades([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBooklistSchools(deferredSchool || undefined)
      .then((res) => {
        if (!cancelled) setSchools(res.data);
      })
      .catch(() => {
        if (!cancelled) setSchools([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deferredSchool]);

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
      if (res.data.school && !school) {
        setSchool(res.data.school);
        setSchoolQuery(res.data.school);
      }
      setInfo(res.data.message);
      setStep("titles");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not scan this photo. You can still enter titles manually.",
      );
      // Allow manual entry even if OCR stack is unavailable.
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
    if (!school.trim()) {
      setError("Choose a school first.");
      return;
    }
    if (titles.length === 0 && catalog.length === 0) {
      // Still allow browsing school list with empty titles
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await matchBooklistTitles({
        school: school.trim(),
        grade: grade || null,
        titles,
      });
      setMatchResults(res.data.results);
      setCatalog(res.data.catalog);
      const next = new Set<number>();
      for (const result of res.data.results) {
        if (result.status === "matched" && result.match) {
          next.add(result.match.product_id);
        }
      }
      setSelected(next);
      setInfo(
        res.data.catalog_count
          ? `Showing ${res.data.catalog_count} book(s) for ${school}${grade ? ` · ${grade}` : ""}.`
          : `No catalog books found for ${school}${grade ? ` · ${grade}` : ""}. Check matches below or adjust filters.`,
      );
      setStep("select");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleProduct(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectSuggestion(productId: number, replaceQuery?: string) {
    setSelected((prev) => new Set(prev).add(productId));
    if (replaceQuery) {
      setInfo(`Selected suggestion for “${replaceQuery}”.`);
    }
  }

  function selectAllAvailable() {
    const next = new Set<number>();
    for (const item of catalog) {
      if (item.stock > 0) next.add(item.id);
    }
    for (const result of matchResults) {
      if (result.match && result.match.stock > 0) {
        next.add(result.match.product_id);
      }
    }
    setSelected(next);
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
      setInfo(res.message || "Added to cart.");
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
        <p className="scan-kicker">School booklists</p>
        <h1>Scan your booklist</h1>
        <p>
          Take a photo of your list, confirm the titles, choose your school and
          grade, then pick the books to add to your cart.
        </p>
        <ol className="scan-steps" aria-label="Progress">
          {(
            [
              ["capture", "Photo"],
              ["titles", "Titles"],
              ["school", "School"],
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
              onClick={() => setStep("school")}
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === "school" ? (
        <section className="scan-panel">
          <h2>School &amp; grade</h2>
          <p className="scan-lead">
            We’ll show the booklist for one school (and grade, if you pick one),
            then match your scanned titles.
          </p>
          <label className="scan-field">
            <span>Search schools</span>
            <input
              type="search"
              value={schoolQuery}
              onChange={(e) => setSchoolQuery(e.target.value)}
              placeholder="e.g. Campion College"
            />
          </label>
          <ul className="scan-school-list">
            {schools.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  className={
                    school === s.name
                      ? "scan-school-btn active"
                      : "scan-school-btn"
                  }
                  onClick={() => {
                    setSchool(s.name);
                    setSchoolQuery(s.name);
                  }}
                >
                  <span>{s.name}</span>
                  <span>
                    {s.product_count} item
                    {s.product_count === 1 ? "" : "s"}
                  </span>
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
              onClick={() => setStep("titles")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !school.trim()}
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
            Review matches from your scan and the school list. Uncertain
            matches show a “Did you mean…?” suggestion.
          </p>

          {matchResults.length > 0 ? (
            <div className="scan-match-block">
              <h3>From your scanned titles</h3>
              <ul className="scan-match-list">
                {matchResults.map((result) => (
                  <li key={result.query} className={`scan-match ${result.status}`}>
                    <p className="scan-match-query">“{result.query}”</p>
                    {result.message ? (
                      <p className="scan-match-hint">{result.message}</p>
                    ) : null}
                    {result.match ? (
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
                          {result.match.author ? ` · ${result.match.author}` : ""}
                          {" · "}
                          <Price value={result.match.price} />
                          <span className="scan-conf-inline">
                            {Math.round(result.match.confidence)}% match
                          </span>
                        </span>
                      </label>
                    ) : null}
                    {result.status !== "matched" && result.suggestions.length > 0 ? (
                      <ul className="scan-suggestions">
                        {result.suggestions.slice(0, 3).map((s) => (
                          <li key={`${result.query}-${s.product_id}`}>
                            <button
                              type="button"
                              className="scan-suggest-btn"
                              onClick={() =>
                                selectSuggestion(s.product_id, result.query)
                              }
                            >
                              {s.did_you_mean || `Did you mean “${s.name}”?`}
                              <span>{Math.round(s.confidence)}%</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="scan-match-block">
            <div className="scan-catalog-head">
              <h3>
                {school}
                {grade ? ` · ${grade}` : ""} booklist
              </h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={selectAllAvailable}
              >
                Select all available
              </button>
            </div>
            {catalog.length === 0 ? (
              <p className="scan-lead">No books listed for this school/grade yet.</p>
            ) : (
              <ul className="scan-catalog-list">
                {catalog.map((item) => (
                  <li key={item.id}>
                    <label className="scan-check-row">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        disabled={item.stock <= 0}
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
                            : "Out of stock"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="scan-footer-bar">
            <p>
              {selected.size} selected
              {selectedItems.length
                ? ` · est. `
                : null}
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
                onClick={() => setStep("school")}
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
        Prefer browsing?{" "}
        <Link href="/#booklists">Search school lists</Link>
        {" · "}
        <Link href="/catalog">Catalog</Link>
      </p>
    </div>
  );
}
