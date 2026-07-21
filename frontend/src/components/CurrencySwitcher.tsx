"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CURRENCY_CODES, CURRENCIES } from "@/lib/currency";
import { useCurrency } from "@/context/CurrencyContext";

export function CurrencySwitcher() {
  const { currency, setCurrency, ready } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`currency-tab${open ? " open" : ""}`}
    >
      <button
        type="button"
        className="currency-tab-handle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="currency-tab-code">{currency}</span>
      </button>

      <div
        id={panelId}
        className="currency-tab-panel"
        role="dialog"
        aria-label="Choose currency"
        hidden={!open}
      >
        <p className="currency-tab-title">Display currency</p>
        <ul className="currency-tab-list">
          {CURRENCY_CODES.map((code) => (
            <li key={code}>
              <button
                type="button"
                className={
                  currency === code
                    ? "currency-tab-option active"
                    : "currency-tab-option"
                }
                disabled={!ready}
                onClick={() => {
                  setCurrency(code);
                  setOpen(false);
                }}
              >
                <strong>{code}</strong>
                <span>{CURRENCIES[code].label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
