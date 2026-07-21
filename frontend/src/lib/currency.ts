export const CURRENCY_CODES = ["USD", "JMD", "CAD", "GBP", "EUR"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type CurrencyOption = {
  code: CurrencyCode;
  label: string;
  /** Approximate units of this currency per 1 USD (base store currency). */
  rateFromUsd: number;
  locale: string;
};

/** Store prices in the database are treated as USD. */
export const BASE_CURRENCY: CurrencyCode = "USD";

export const CURRENCIES: Record<CurrencyCode, CurrencyOption> = {
  USD: { code: "USD", label: "US Dollar", rateFromUsd: 1, locale: "en-US" },
  JMD: {
    code: "JMD",
    label: "Jamaican Dollar",
    rateFromUsd: 155,
    locale: "en-JM",
  },
  CAD: {
    code: "CAD",
    label: "Canadian Dollar",
    rateFromUsd: 1.36,
    locale: "en-CA",
  },
  GBP: {
    code: "GBP",
    label: "British Pound",
    rateFromUsd: 0.79,
    locale: "en-GB",
  },
  EUR: { code: "EUR", label: "Euro", rateFromUsd: 0.92, locale: "en-IE" },
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

export function convertFromUsd(amountUsd: number, currency: CurrencyCode) {
  const rate = CURRENCIES[currency].rateFromUsd;
  return amountUsd * rate;
}

export function formatMoney(
  amountUsd: number,
  currency: CurrencyCode = BASE_CURRENCY,
) {
  const option = CURRENCIES[currency];
  const converted = convertFromUsd(amountUsd, currency);
  return new Intl.NumberFormat(option.locale, {
    style: "currency",
    currency: option.code,
    maximumFractionDigits: currency === "JMD" ? 0 : 2,
  }).format(converted);
}
