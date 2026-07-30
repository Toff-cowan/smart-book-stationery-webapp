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
  fetchInventory,
  matchBooklistTitles,
  scanBooklistImage,
  type BookMatchResult,
  type BookMatchSuggestion,
  type OcrTitleLine,
} from "@/lib/api";
import type { GradeFilter, InventoryItem } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Price } from "@/components/Price";
import { CatalogTypeahead } from "@/components/CatalogTypeahead";
import { downloadQuoteTableImage } from "@/lib/quoteImage";

type Step = "capture" | "titles" | "select";

function inventoryToSuggestion(item: InventoryItem): BookMatchSuggestion {
  return {
    product_id: item.id,
    name: item.name,
    author: item.author,
    isbn: item.isbn ?? null,
    price: item.price,
    stock: item.stock,
    school: item.school,
    grades: item.grades ?? [],
    confidence: 0,
    did_you_mean: null,
  };
}
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
  /** Manual catalog search terms / hits per scanned title. */
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [searchHits, setSearchHits] = useState<
    Record<string, BookMatchSuggestion[]>
  >({});
  /** Quantities for selected product ids (default 1). */
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    fetchGrades()
      .then((res) => setGrades(res.data))
      .catch(() => setGrades([]));
  }, []);

  const selectedItems = useMemo(() => {
    const byId = new Map<number, InventoryItem>();
    for (const item of catalog) byId.set(item.id, item);
    const remember = (hit: BookMatchSuggestion | null | undefined) => {
      if (!hit) return;
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
        isbn: hit.isbn ?? null,
        rating_stars: null,
        rating_count: 0,
        image_url: null,
        is_active: true,
        category_id: null,
        school: hit.school,
        grades: hit.grades,
        description: null,
      });
    };
    for (const result of matchResults) {
      remember(result.match);
      for (const s of result.suggestions) remember(s);
      for (const s of searchHits[result.query] || []) remember(s);
    }
    return Array.from(selected)
      .map((id) => byId.get(id))
      .filter(Boolean) as InventoryItem[];
  }, [selected, catalog, matchResults, searchHits]);

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
      const nextQty: Record<number, number> = {};
      for (const result of res.data.results) {
        if (result.status === "matched" && result.match) {
          next.add(result.match.product_id);
          nextPicks[result.query] = result.match.product_id;
          nextQty[result.match.product_id] = 1;
        }
      }
      setSelected(next);
      setPicks(nextPicks);
      setQuantities(nextQty);
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
    // Confident auto-match: keep the matched product only.
    if (result.status === "matched" && result.match) {
      return [result.match];
    }
    // Live typeahead hits for unmatched titles.
    return [...(searchHits[result.query] || [])].slice(0, 8);
  }

  function setQuantity(productId: number, quantity: number) {
    const nextQty = Math.max(1, Math.min(99, Math.floor(quantity) || 1));
    setQuantities((prev) => ({ ...prev, [productId]: nextQty }));
  }

  function qtyFor(productId: number) {
    return quantities[productId] ?? 1;
  }

  function chooseOption(query: string, productId: number, siblingIds: number[]) {
    setPicks((prev) => ({ ...prev, [query]: productId }));
    setQuantities((prev) => ({
      ...prev,
      [productId]: prev[productId] ?? 1,
    }));
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
      else {
        next.add(id);
        setQuantities((q) => ({ ...q, [id]: q[id] ?? 1 }));
      }
      return next;
    });
  }

  function selectAllAvailable() {
    const next = new Set<number>();
    const nextPicks: Record<string, number> = { ...picks };
    const nextQty = { ...quantities };
    for (const item of catalog) {
      next.add(item.id);
      nextQty[item.id] = nextQty[item.id] ?? 1;
    }
    for (const result of matchResults) {
      const chosen =
        picks[result.query] ??
        (result.status === "matched" ? result.match?.product_id : undefined) ??
        optionsForResult(result)[0]?.product_id;
      if (chosen) {
        next.add(chosen);
        nextPicks[result.query] = chosen;
        nextQty[chosen] = nextQty[chosen] ?? 1;
      }
    }
    setSelected(next);
    setPicks(nextPicks);
    setQuantities(nextQty);
  }

  function downloadSelectedQuote() {
    if (selectedItems.length === 0) {
      setError("Select at least one book to download a quote.");
      return;
    }
    void downloadQuoteTableImage(
      selectedItems.map((item) => ({
        quantity: qtyFor(item.id),
        name: item.name,
        cost: item.price,
      })),
      `bookstore-quote-${new Date().toISOString().slice(0, 10)}.png`,
    ).then(() => setInfo("Quote image saved."));
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
        quantity: qtyFor(product_id),
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
            Confirmed matches are selected for you. For anything else, search the
            catalog and pick the correct book.
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
                  const searched = searchHits[result.query] || [];

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
                          {selected.has(result.match.product_id) ? (
                            <label className="scan-qty">
                              Qty
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={qtyFor(result.match.product_id)}
                                onChange={(e) =>
                                  setQuantity(
                                    result.match!.product_id,
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="scan-match-hint">
                            No confident match — type to search and pick a book
                            from the suggestions.
                          </p>
                          <CatalogTypeahead
                            value={searchTerms[result.query] ?? result.query}
                            grade={grade}
                            disabled={busy}
                            onChange={(next) =>
                              setSearchTerms((prev) => ({
                                ...prev,
                                [result.query]: next,
                              }))
                            }
                            onSelect={(item) => {
                              const suggestion = inventoryToSuggestion(item);
                              setSearchHits((prev) => ({
                                ...prev,
                                [result.query]: [
                                  suggestion,
                                  ...(prev[result.query] || []).filter(
                                    (row) => row.product_id !== item.id,
                                  ),
                                ].slice(0, 8),
                              }));
                              chooseOption(
                                result.query,
                                item.id,
                                [
                                  ...siblingIds,
                                  item.id,
                                  ...(searchHits[result.query] || []).map(
                                    (s) => s.product_id,
                                  ),
                                ],
                              );
                              setSearchTerms((prev) => ({
                                ...prev,
                                [result.query]: item.name,
                              }));
                            }}
                          />
                          {searched.length > 0 ? (
                            <ul
                              className="scan-suggestions"
                              role="radiogroup"
                              aria-label={`Catalog results for ${result.query}`}
                            >
                              {searched.map((s) => {
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
                                        </span>
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                          {chosenId ? (
                            <div className="scan-pick-meta">
                              <label className="scan-qty">
                                Qty
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={qtyFor(chosenId)}
                                  onChange={(e) =>
                                    setQuantity(
                                      chosenId,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="scan-clear-pick"
                                onClick={() =>
                                  clearPick(result.query, siblingIds)
                                }
                              >
                                Clear selection
                              </button>
                            </div>
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
                  value={selectedItems.reduce(
                    (sum, i) => sum + i.price * qtyFor(i.id),
                    0,
                  )}
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
                className="btn-secondary"
                disabled={selected.size === 0}
                onClick={downloadSelectedQuote}
              >
                Download quote image
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
