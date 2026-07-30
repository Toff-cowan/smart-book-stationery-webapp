import Link from "next/link";

const INSTAGRAM_URL = "https://www.instagram.com/smart_bookstore_";

function InstagramIcon() {
  return (
    <svg
      className="site-footer-social-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-col">
          <h3>Explore</h3>
          <ul>
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/catalog">Catalog</Link>
            </li>
            <li>
              <Link href="/catalog?department=textbooks">Textbooks</Link>
            </li>
            <li>
              <Link href="/catalog?department=stationery">Stationery</Link>
            </li>
            <li>
              <Link href="/cart">Cart</Link>
            </li>
          </ul>
        </div>

        <div className="site-footer-col">
          <h3>Book scan</h3>
          <p>
            Scan or upload a booklist and match items to our catalog.{" "}
            <Link href="/booklist/scan">Open book scan</Link>
          </p>
        </div>

        <div className="site-footer-col">
          <h3>Pickup & support</h3>
          <p>
            Reserve online, pay and collect in store. Sign in to view your cart
            and track orders.
          </p>
          <p className="site-footer-hours">Mon–Sat · store hours vary by season</p>
          <p className="site-footer-legal-links">
            <Link href="/terms">Terms</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/privacy">Privacy</Link>
          </p>
          <a
            className="site-footer-social"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Smart Bookstore on Instagram"
          >
            <InstagramIcon />
            <span>Visit Our Instagram</span>
          </a>
        </div>
      </div>
      <div className="site-footer-bottom">
        <div className="site-footer-bottom-inner">
          <p>
            © {new Date().getFullYear()} Smart Books Stationery and Supplies Ltd
            {" · "}
            <Link href="/terms">Terms</Link>
            {" · "}
            <Link href="/privacy">Privacy</Link>
          </p>
          <a
            className="site-footer-social site-footer-social-bottom"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Smart Bookstore on Instagram"
          >
            <InstagramIcon />
            <span>Instagram</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
