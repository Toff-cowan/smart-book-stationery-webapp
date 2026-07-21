"use client";

import { useCurrency } from "@/context/CurrencyContext";

type PriceProps = {
  value: number;
  className?: string;
};

/** Displays a USD store amount in the visitor's selected currency. */
export function Price({ value, className }: PriceProps) {
  const { formatPrice } = useCurrency();
  return <span className={className}>{formatPrice(value)}</span>;
}
