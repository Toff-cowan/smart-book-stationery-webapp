import Link from "next/link";

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
          <h3>Booklists</h3>
          <p>
            Search your school list on the home page, or upload one if it is not
            listed yet. No account needed to upload.
          </p>
        </div>

        <div className="site-footer-col">
          <h3>Pickup & support</h3>
          <p>
            Reserve online, pay and collect in store. Sign in to view your cart
            and track orders.
          </p>
          <p className="site-footer-hours">Mon–Sat · store hours vary by season</p>
        </div>
      </div>
      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} Smart Books Stationery and Supplies Ltd</p>
      </div>
    </footer>
  );
}
