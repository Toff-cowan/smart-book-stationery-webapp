"use client";

import { useEffect, useState } from "react";

export type DealSlide = {
  id: string;
  title: string;
  subtitle: string;
  tone: "sage" | "ink" | "gold";
};

const DEFAULT_SLIDES: DealSlide[] = [
  {
    id: "back-to-school",
    title: "Back-to-school lists ready",
    subtitle: "Grade packs priced and ready to reserve in-store.",
    tone: "sage",
  },
  {
    id: "stationery-week",
    title: "Stationery week",
    subtitle: "Notebooks, pens, and geometry sets restocked daily.",
    tone: "ink",
  },
  {
    id: "gift-desk",
    title: "Gift desk opens early",
    subtitle: "Tote bags and keepsakes for teachers and graduates.",
    tone: "gold",
  },
];

type DealsCarouselProps = {
  slides?: DealSlide[];
};

export function DealsCarousel({ slides = DEFAULT_SLIDES }: DealsCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[index];

  return (
    <section className="landing-carousel" aria-roledescription="carousel" aria-label="Deals and updates">
      <div className="landing-carousel-frame">
        <div
          key={slide.id}
          className={`landing-slide tone-${slide.tone}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${slides.length}`}
        >
          <p className="landing-slide-kicker">Updates</p>
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
        </div>

        <div className="landing-carousel-controls">
          <button
            type="button"
            className="carousel-nav"
            aria-label="Previous slide"
            onClick={() =>
              setIndex((current) => (current - 1 + slides.length) % slides.length)
            }
          >
            ←
          </button>
          <div className="carousel-dots" role="tablist" aria-label="Choose slide">
            {slides.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show ${item.title}`}
                className={i === index ? "dot active" : "dot"}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="carousel-nav"
            aria-label="Next slide"
            onClick={() => setIndex((current) => (current + 1) % slides.length)}
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}
