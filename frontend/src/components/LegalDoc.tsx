import type { ReactNode } from "react";
import Link from "next/link";

import { BRAND_NAME } from "@/lib/brand";

export const LEGAL_EFFECTIVE_DATE = "29 July 2026";
export const LEGAL_OPERATOR = BRAND_NAME;

export function LegalDoc({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="legal-page">
      <header className="legal-head">
        <p className="legal-kicker">Legal</p>
        <h1>{title}</h1>
        <p className="legal-meta">
          Effective date: <strong>{LEGAL_EFFECTIVE_DATE}</strong>
          <br />
          Operated by {LEGAL_OPERATOR} (“we”, “us”, “our”).
        </p>
      </header>
      <div className="legal-body">{children}</div>
      <p className="legal-nav">
        <Link href="/privacy">Privacy Policy</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms">Terms &amp; Conditions</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/">Home</Link>
      </p>
    </article>
  );
}
