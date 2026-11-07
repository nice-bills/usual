"use client";
// The page's one pinned moment: the hero holds for PIN px while the headline dissolves and the dashboard scales up.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ROTATING } from "./content";
import { Logo } from "./Logo";
import s from "./landing.module.css";

const PIN = 600;

export function PinnedHero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / PIN));
      el.style.setProperty("--p", p.toFixed(4));
      el.dataset.revealed = String(p > 0.6);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, []);
  return <section ref={ref} className={s.hero} style={{ "--p": 0, "--pin": `${PIN}px` } as CSSProperties} data-revealed="false">{children}</section>;
}

// The clip is baked so its last frame crossfades into its first, so the native loop has no visible seam.
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // React doesn't render the muted attribute, and autoplay needs it.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={ref} className={s.video} muted loop playsInline preload="auto" poster="/video/hero-poster.jpg" aria-hidden="true">
      <source src="/video/hero-720.mp4" type="video/mp4" media="(max-width: 900px)" />
      <source src="/video/hero.mp4" type="video/mp4" />
    </video>
  );
}

export function RotatingName() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % ROTATING.length), 2400);
    return () => clearInterval(t);
  }, []);
  const prev = (i - 1 + ROTATING.length) % ROTATING.length;
  return (
    <span className={s.slot} aria-hidden="true">
      {ROTATING.map((r, k) => (
        <span key={r.name} className={s.slotItem} data-state={k === i ? "in" : k === prev ? "out" : "idle"}>
          <Logo name={r.logo} className={s.slotLogo} />{r.name}
        </span>
      ))}
    </span>
  );
}
