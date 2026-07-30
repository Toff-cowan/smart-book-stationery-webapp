import type { Metadata } from "next";

import { LegalDoc, LEGAL_EFFECTIVE_DATE, LEGAL_OPERATOR } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${LEGAL_OPERATOR} collects, stores, and uses personal data.`,
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy">
      <p>
        This Privacy Policy explains what information {LEGAL_OPERATOR} collects
        through our website and related tools, how it is stored, how we use it,
        and which third-party services help us operate. It applies from the
        effective date above.
      </p>

      <h2>1. What we collect</h2>
      <p>Depending on how you use the Service, we may collect:</p>
      <ul>
        <li>
          <strong>Account details</strong> — name, email address, password (stored
          as a secure hash, not plain text), and optional profile fields you
          provide.
        </li>
        <li>
          <strong>Google sign-in</strong> — if you choose Google login, we receive
          identity information from our auth provider (such as email and name)
          needed to create or link your customer account.
        </li>
        <li>
          <strong>Order / quote details</strong> — items selected, quantities,
          contact email, phone number, notes, school/grade context where
          provided, and order status history.
        </li>
        <li>
          <strong>Booklist scans</strong> — photos or images you upload for
          title extraction, plus titles/authors you confirm or edit before
          matching to our catalog.
        </li>
        <li>
          <strong>Mailing list</strong> — email addresses submitted for store
          updates.
        </li>
        <li>
          <strong>Ratings &amp; messages</strong> — product ratings/comments and
          in-app notifications related to your account or orders.
        </li>
        <li>
          <strong>Device / browser storage</strong> — items such as your signed-in
          session token and recent search terms stored locally in your browser
          to make the site work.
        </li>
        <li>
          <strong>Operational logs</strong> — basic technical logs from hosting
          (for example request errors) needed to keep the Service running.
        </li>
      </ul>

      <h2>2. What we store</h2>
      <ul>
        <li>
          Account, catalog, cart, order, notification, mailing-list, and related
          business data in our application database (hosted with our cloud
          database provider).
        </li>
        <li>
          Product, avatar, carousel, and similar images with our media host when
          uploads are enabled.
        </li>
        <li>
          Authentication sessions via our auth / API stack (including tokens used
          by the website after you sign in).
        </li>
        <li>
          Email content we send (order updates, mailing-list messages) through
          our configured email automation path.
        </li>
      </ul>
      <p>
        We keep information for as long as needed to run the store, fulfill
        orders, meet legal or accounting needs, and resolve disputes, then
        delete or anonymize when appropriate.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>Provide catalog browsing, accounts, carts, and order requests.</li>
        <li>Contact you about pickup, order status, and store updates you opted into.</li>
        <li>Match scanned or typed book titles to inventory.</li>
        <li>Improve stock operations and customer support for staff users.</li>
        <li>Secure the Service and prevent abuse.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information. We do not use
        booklist photos for advertising networks.
      </p>

      <h2>4. AI use</h2>
      <p>We use automated / AI-assisted features for:</p>
      <ul>
        <li>
          <strong>Booklist photo reading</strong> — extracting likely book titles
          and authors from images you upload (third-party AI model, with OCR
          fallback in some cases).
        </li>
        <li>
          <strong>Catalog matching suggestions</strong> — comparing those titles
          (and your edits) to products in our inventory using matching logic on
          our servers.
        </li>
      </ul>
      <p>
        AI is an assistant only. Staff and customers should verify results.
        Do not upload images that contain sensitive personal data unrelated to
        shopping (for example IDs or private documents).
      </p>

      <h2>5. Third-party applications we use to host and operate</h2>
      <p>
        We use reputable third-party services. Categories include:
      </p>
      <ul>
        <li>
          <strong>Website hosting</strong> — front-end application hosting (e.g.
          Vercel).
        </li>
        <li>
          <strong>API / server hosting</strong> — backend application hosting
          (e.g. Render).
        </li>
        <li>
          <strong>Database &amp; auth</strong> — cloud Postgres and optional
          Google sign-in brokerage (e.g. Supabase; Google as identity provider).
        </li>
        <li>
          <strong>Media storage</strong> — product and carousel image hosting
          (e.g. Cloudinary when configured).
        </li>
        <li>
          <strong>AI processing</strong> — booklist image understanding (e.g.
          Google Gemini when configured).
        </li>
        <li>
          <strong>Email delivery</strong> — transactional and mailing-list email
          via automation connected to our store mailbox (e.g. n8n → Gmail when
          configured).
        </li>
      </ul>
      <p>
        Those providers process data under their own terms and security
        practices, on our instructions, to deliver the Service.
      </p>

      <h2>6. What we do not approve of</h2>
      <ul>
        <li>Using the Service to harm others, commit fraud, or break the law.</li>
        <li>
          Uploading illegal or abusive content, or photos that invade others’
          privacy.
        </li>
        <li>
          Attempting to access other customers’ accounts, staff tools, or raw
          databases.
        </li>
        <li>
          Harvesting emails or personal data from the Service for spam or
          unrelated marketing.
        </li>
      </ul>

      <h2>7. Your choices</h2>
      <ul>
        <li>Update profile details while signed in.</li>
        <li>
          Ask us to remove you from the mailing list (or use unsubscribe when
          provided).
        </li>
        <li>
          Request access, correction, or deletion of personal data we hold,
          subject to orders we must retain for legitimate business or legal
          reasons.
        </li>
        <li>
          Clear browser storage / sign out to remove local session and recent
          search data on your device.
        </li>
      </ul>

      <h2>8. Children</h2>
      <p>
        The Service is aimed at parents, guardians, and students shopping for
        school materials with adult involvement as needed. If you believe we
        have collected a child’s data inappropriately, contact us and we will
        address it.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this Policy. The effective date at the top will be revised
        when material changes are made.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions: contact {LEGAL_OPERATOR} through the channels listed
        on our website or Instagram, or ask in store.
      </p>

      <p className="legal-updated">Last updated: {LEGAL_EFFECTIVE_DATE}</p>
    </LegalDoc>
  );
}
