import Link from "next/link";

import { DealsCarousel } from "@/components/landing/DealsCarousel";
import { FoldScroll } from "@/components/landing/FoldScroll";

export function LandingPage() {
  return (
    <div className="landing-root">
      <div className="site-grid" aria-hidden="true" />

      <div className="landing-content">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-brand">Smart Book Stationery</p>
            <h1>Welcome — your school list starts here</h1>
            <p className="landing-lead">
              Browse titles, build a priced booklist, and collect it from the bookstore.
            </p>
            <div className="landing-cta-row">
              <Link href="/catalog" className="btn-primary">
                Browse catalog
              </Link>
              <Link href="/login" className="landing-cta-secondary">
                Sign in
              </Link>
            </div>
          </div>
          <div className="landing-hero-visual" aria-hidden="true">
            <div className="landing-hero-shelf">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </section>

        <DealsCarousel />
        <FoldScroll />
      </div>
    </div>
  );
}
