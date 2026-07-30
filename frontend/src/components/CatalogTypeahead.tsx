"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { fetchInventory } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";
import { Price } from "@/components/Price";
import { loadRecentSearches, pushRecentSearch } from "@/lib/recentSearches";

type CatalogTypeaheadProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: InventoryItem) => void;
  grade?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Used to namespace recent-search storage per field if needed. */
  inputId?: string;
};

export function CatalogTypeahead({
  value,
  onChange,
  onSelect,
  grade,
  placeholder = "Start typing a title or ISBN…",
  disabled,
}: CatalogTypeaheadProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<InventoryItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchInventory({
        q: term,
        grade: grade || undefined,
        per_page: 5,
      })
        .then((res) => {
          if (cancelled) return;
          setHits((res.data || []).slice(0, 5));
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, grade]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function pickItem(item: InventoryItem) {
    pushRecentSearch(value.trim() || item.name);
    setRecent(loadRecentSearches());
    onSelect(item);
    setOpen(false);
  }

  function applyRecent(term: string) {
    onChange(term);
    setOpen(true);
  }

  const showRecentOnly = open && value.trim().length < 2 && recent.length > 0;
  const showHits = open && value.trim().length >= 2;
  const recentRows = recent.slice(0, 5);
  const showPanel = showRecentOnly || showHits;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    const showRecent = value.trim().length < 2;
    const optionsCount = showRecent
      ? recentRows.length
      : hits.length + recentRows.length;
    if (!optionsCount && e.key !== "Escape") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(optionsCount, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? optionsCount - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      if (showRecent) {
        applyRecent(recentRows[activeIndex]);
      } else if (activeIndex < hits.length) {
        pickItem(hits[activeIndex]);
      } else {
        applyRecent(recentRows[activeIndex - hits.length]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="catalog-typeahead" ref={rootRef}>
      <label className="scan-field catalog-typeahead-field">
        <span>Find a book</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(loadRecentSearches());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      {showPanel ? (
        <ul
          id={listId}
          className="catalog-typeahead-panel"
          role="listbox"
          aria-label="Catalog suggestions"
        >
          {showHits ? (
            <>
              <li className="catalog-typeahead-label">Suggestions</li>
              {loading ? (
                <li className="catalog-typeahead-empty">Searching…</li>
              ) : hits.length === 0 ? (
                <li className="catalog-typeahead-empty">No books found</li>
              ) : (
                hits.map((item, index) => (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={activeIndex === index}
                  >
                    <button
                      type="button"
                      className={
                        activeIndex === index
                          ? "catalog-typeahead-item active"
                          : "catalog-typeahead-item"
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickItem(item)}
                    >
                      <span className="catalog-typeahead-name">{item.name}</span>
                      <span className="catalog-typeahead-meta">
                        {item.author ? `${item.author} · ` : null}
                        <Price value={item.price} />
                      </span>
                    </button>
                  </li>
                ))
              )}
            </>
          ) : null}

          {recentRows.length > 0 ? (
            <>
              <li className="catalog-typeahead-label">Previous searches</li>
              {recentRows.map((term, index) => {
                const optionIndex = showHits ? hits.length + index : index;
                return (
                  <li
                    key={term}
                    role="option"
                    aria-selected={activeIndex === optionIndex}
                  >
                    <button
                      type="button"
                      className={
                        activeIndex === optionIndex
                          ? "catalog-typeahead-item active"
                          : "catalog-typeahead-item"
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyRecent(term)}
                    >
                      <span className="catalog-typeahead-name">{term}</span>
                    </button>
                  </li>
                );
              })}
            </>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
