"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const PANELS = [
  {
    id: "browse",
    title: "Browse what you need",
    body: "Textbooks, stationery, and gifts in one catalog — search by title or department.",
    cta: { href: "/catalog", label: "Open catalog" },
  },
  {
    id: "list",
    title: "Build a priced list",
    body: "Add items to your cart, then reserve or request pickup. No online payment — the bookstore fulfills offline.",
    cta: { href: "/cart", label: "View cart" },
  },
  {
    id: "ready",
    title: "Collect when ready",
    body: "Track order status and get notified when your list is packed and waiting for you.",
    cta: { href: "/login", label: "Sign in" },
  },
] as const;

export function FoldScroll() {
  const trackRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const total = track.offsetHeight - window.innerHeight;
      if (total <= 0) {
        setProgress(0);
        return;
      }
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      setProgress(scrolled / total);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={trackRef} className="fold-track" aria-label="How it works">
      {PANELS.map((panel, index) => {
        const start = index / PANELS.length;
        const end = (index + 1) / PANELS.length;
        const local = Math.min(1, Math.max(0, (progress - start) / (end - start)));
        // Fold away as the next panel takes over
        const foldOut = index < PANELS.length - 1 ? local : 0;
        const rotate = foldOut * -78;
        const opacity = 1 - foldOut * 0.55;
        const z = PANELS.length - index;

        return (
          <div key={panel.id} className="fold-sticky">
            <article
              className="fold-panel"
              style={{
                zIndex: z,
                opacity,
                transform: `perspective(1400px) rotateX(${rotate}deg)`,
                transformOrigin: "center top",
              }}
            >
              <p className="fold-step">0{index + 1}</p>
              <h2>{panel.title}</h2>
              <p>{panel.body}</p>
              <Link href={panel.cta.href} className="btn-primary fold-cta">
                {panel.cta.label}
              </Link>
            </article>
          </div>
        );
      })}
    </section>
  );
}
