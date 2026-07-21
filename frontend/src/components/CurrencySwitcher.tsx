"use client";

import { CURRENCY_CODES, CURRENCIES } from "@/lib/currency";
import { useCurrency } from "@/context/CurrencyContext";

export function CurrencySwitcher() {
  const { currency, setCurrency, ready } = useCurrency();

  return (
    <label className="currency-switcher">
      <span className="sr-only">Currency</span>
      <select
        value={currency}
        disabled={!ready}
        aria-label="Select currency"
        onChange={(e) =>
          setCurrency(e.target.value as (typeof CURRENCY_CODES)[number])
        }
      >
        {CURRENCY_CODES.map((code) => (
          <option key={code} value={code}>
            {code} · {CURRENCIES[code].label}
          </option>
        ))}
      </select>
    </label>
  );
}
