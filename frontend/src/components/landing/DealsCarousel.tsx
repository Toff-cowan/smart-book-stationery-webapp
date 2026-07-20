"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export type HeroSlide = {
  id: string;
  title: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
};

const SLIDE_MS = 5000;

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: "all-ages",
    title: "Find Books For All Ages!",
    ctaLabel: "Shop Now",
    ctaHref: "/catalog",
    image: "/landing/hero-1.png",
  },
  {
    id: "school-lists",
    title: "Build Your School Booklist",
    ctaLabel: "Browse Catalog",
    ctaHref: "/catalog",
    image: "/landing/hero-1.png",
  },
  {
    id: "stationery",
    title: "Stationery Ready For Term",
    ctaLabel: "Shop Stationery",
    ctaHref: "/catalog?department=stationery",
    image: "/landing/hero-1.png",
  },
];

type DealsCarouselProps = {
  slides?: HeroSlide[];
};

export function DealsCarousel({ slides = DEFAULT_SLIDES }: DealsCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

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

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((slide, i) => (
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
          <div className="hero-slide-content">
            <h1>{slide.title}</h1>
            <Link href={slide.ctaHref} className="hero-shop-btn">
              {slide.ctaLabel}
            </Link>
          </div>
        </div>
      ))}

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

      <div
        className="hero-progress"
        aria-hidden="true"
      >
        <div
          key={`${index}-${paused ? "p" : "r"}`}
          className={
            paused ? "hero-progress-bar paused" : "hero-progress-bar"
          }
          style={{ animationDuration: `${SLIDE_MS}ms` }}
        />
      </div>
    </section>
  );
}
