import type { Metadata } from "next";

import { LegalDoc, LEGAL_EFFECTIVE_DATE, LEGAL_OPERATOR } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: `Terms of use for the ${LEGAL_OPERATOR} online store and booklist tools.`,
};

export default function TermsPage() {
  return (
    <LegalDoc title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions govern your use of our website, catalog,
        cart, order requests, booklist scan tools, and related services
        (together, the “Service”). By using the Service you agree to these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The Service is provided by {LEGAL_OPERATOR} for browsing textbooks and
        stationery, reserving items for in-store pickup, and related store
        operations. Online checkout is a <strong>quote / reservation</strong>{" "}
        flow unless we clearly state otherwise — payment and collection are
        completed in store according to our staff’s instructions.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>
          You may create a customer account with email and password, or sign in
          with Google through our authentication provider.
        </li>
        <li>
          Staff and owner accounts are for authorized bookstore personnel only.
        </li>
        <li>
          You are responsible for keeping your login details secure and for
          activity under your account.
        </li>
        <li>
          Provide accurate contact details (especially email and phone on
          orders) so we can fulfill and contact you about pickup.
        </li>
      </ul>

      <h2>3. Catalog, orders, and availability</h2>
      <ul>
        <li>
          Product details, prices, grades, and stock are shown for guidance and
          may change. Staff may confirm final availability and totals in store.
        </li>
        <li>
          Submitting a cart request notifies the bookstore; it does not
          guarantee stock until confirmed.
        </li>
        <li>
          Quote images you download are estimates only and are not invoices
          unless we say so.
        </li>
      </ul>

      <h2>4. Booklist scan and AI features</h2>
      <p>
        The booklist scan feature may use automated tools (including third-party
        AI / OCR) to read titles from photos you upload and to suggest catalog
        matches. You must review every extracted title and selection before
        adding items to your cart. AI output can be wrong, incomplete, or
        outdated — you are responsible for verifying against your official
        school list.
      </p>

      <h2>5. Acceptable use — what we do not approve of</h2>
      <p>You must not:</p>
      <ul>
        <li>
          Upload illegal, harmful, or abusive content, or photos that are not
          your booklist / school materials for legitimate shopping.
        </li>
        <li>
          Attempt to hack, scrape at scale, overload, or disrupt the Service or
          other users.
        </li>
        <li>
          Impersonate others, create fake orders, or misuse staff tools.
        </li>
        <li>
          Use the Service to harass staff or customers, commit fraud, or violate
          applicable law.
        </li>
        <li>
          Reverse engineer or misuse our APIs, credentials, or third-party
          integrations beyond normal use of the website.
        </li>
      </ul>
      <p>
        We may suspend or remove access, orders, or content that violate these
        Terms or harm the store or other users.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service relies on third-party providers to host and operate
        features (for example cloud hosting, database, authentication, image
        storage, email delivery, and AI processing). Their availability and
        policies may affect the Service. See our Privacy Policy for more detail.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Store branding, catalog content we publish, and the Service software are
        owned by us or our licensors. You may use the Service for personal
        shopping and legitimate school-list purposes only.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided “as is.” We do not warrant uninterrupted access,
        perfect OCR/AI accuracy, or that online stock will always match the
        shelf. To the fullest extent allowed by law, we are not liable for
        indirect or consequential losses arising from use of the Service.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms from time to time. The effective date at the
        top will change when we do. Continued use after an update means you
        accept the revised Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms: contact the bookstore using the details
        published on our site or Instagram, or speak with staff in store.
      </p>

      <p className="legal-updated">Last updated: {LEGAL_EFFECTIVE_DATE}</p>
    </LegalDoc>
  );
}
