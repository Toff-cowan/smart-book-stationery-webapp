"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BRAND_NAME } from "@/lib/brand";
import { fetchHeroSlides, type HeroSlideRecord } from "@/lib/api";
import { mediaUrl } from "@/lib/format";

export type HeroSlide = {
  id: string;
  brand: string;
  subtitle: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  image: string;
};

const SLIDE_MS = 5000;
const FALLBACK_IMAGE = "/landing/hero-1.png";

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: "home",
    brand: BRAND_NAME,
    subtitle: "Shop textbooks & stationery. Reserve online for in-store pickup.",
    primaryLabel: "Shop Now",
    primaryHref: "/catalog",
    secondaryLabel: "View All",
    secondaryHref: "/catalog",
    image: FALLBACK_IMAGE,
  },
  {
    id: "lists",
    brand: BRAND_NAME,
    subtitle: "Find your school booklist — or upload it if it is not listed yet.",
    primaryLabel: "Shop Now",
    primaryHref: "/catalog",
    secondaryLabel: "Book scan",
    secondaryHref: "/booklist/scan",
    image: FALLBACK_IMAGE,
  },
  {
    id: "stationery",
    brand: BRAND_NAME,
    subtitle: "Pens, books, and supplies ready for the new term.",
    primaryLabel: "Shop Stationery",
    primaryHref: "/catalog?department=stationery",
    secondaryLabel: "View All",
    secondaryHref: "/catalog",
    image: FALLBACK_IMAGE,
  },
];

function mapRecord(slide: HeroSlideRecord): HeroSlide {
  return {
    id: String(slide.id),
    brand: BRAND_NAME,
    subtitle: (slide.subtitle || "").trim(),
    primaryLabel: (slide.primary_label || "").trim(),
    primaryHref: (slide.primary_href || "").trim(),
    secondaryLabel: (slide.secondary_label || "").trim(),
    secondaryHref: (slide.secondary_href || "").trim(),
    image: mediaUrl(slide.image_url) || FALLBACK_IMAGE,
  };
}

type DealsCarouselProps = {
  slides?: HeroSlide[];
};

export function DealsCarousel({ slides: initialSlides }: DealsCarouselProps) {
  const [slides, setSlides] = useState<HeroSlide[]>(
    initialSlides ?? DEFAULT_SLIDES,
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (initialSlides) {
      setSlides(initialSlides);
      return;
    }
    let cancelled = false;
    fetchHeroSlides()
      .then((res) => {
        if (cancelled) return;
        if (res.data.length > 0) {
          setSlides(res.data.map(mapRecord));
          setIndex(0);
        }
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [initialSlides]);

  const goTo = useCallback(
    (next: number) => {
      setIndex((next + slides.length) % slides.length);
    },
    [slides.length],
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setTimeout(() => {
      goTo(index + 1);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, slides.length, goTo]);

  if (slides.length === 0) return null;

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((slide, i) => {
        const subtitle = slide.subtitle.trim();
        const primaryHref = slide.primaryHref.trim();
        const secondaryHref = slide.secondaryHref.trim();
        const primaryLabel = slide.primaryLabel.trim() || "Shop";
        const secondaryLabel = slide.secondaryLabel.trim() || "Learn more";
        const hasCopy = Boolean(subtitle || primaryHref || secondaryHref);

        return (
          <div
            key={slide.id}
            className={i === index ? "hero-slide active" : "hero-slide"}
            role="group"
            aria-roledescription="slide"
            aria-hidden={i !== index}
            aria-label={`${i + 1} of ${slides.length}`}
            style={{ backgroundImage: `url(${slide.image})` }}
          >
            <div className="hero-slide-overlay" />
            {hasCopy ? (
              <div className="hero-slide-content">
                {subtitle ? <p className="hero-subtitle">{subtitle}</p> : null}
                {primaryHref || secondaryHref ? (
                  <div className="hero-cta-row">
                    {primaryHref ? (
                      <Link href={primaryHref} className="hero-shop-btn">
                        {primaryLabel}
                      </Link>
                    ) : null}
                    {secondaryHref ? (
                      <Link href={secondaryHref} className="hero-outline-btn">
                        {secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        className="hero-arrow prev"
        aria-label="Previous slide"
        onClick={() => goTo(index - 1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="hero-arrow next"
        aria-label="Next slide"
        onClick={() => goTo(index + 1)}
      >
        ›
      </button>

      <div className="hero-progress" aria-hidden="true">
        <div
          key={`${index}-${paused ? "p" : "r"}`}
          className={paused ? "hero-progress-bar paused" : "hero-progress-bar"}
          style={{ animationDuration: `${SLIDE_MS}ms` }}
        />
      </div>
    </section>
  );
}
