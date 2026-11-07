"use client";
// Lenis smooth scroll for the landing page, plus the plain fade-and-rise for anything marked data-reveal.
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const previousBg = root.style.background;
    root.style.background = "#0b0c0b";

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduced ? null : new Lenis({ autoRaf: true, anchors: true, lerp: 0.085, wheelMultiplier: 0.9 });

    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = "true"; io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    items.forEach((el) => io.observe(el));
    root.classList.add("reveal-ready");

    return () => {
      io.disconnect();
      lenis?.destroy();
      root.classList.remove("reveal-ready");
      root.style.background = previousBg;
    };
  }, []);
  return null;
}
