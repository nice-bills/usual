"use client";
// A field of dots that breathes on its own and ripples out of the orb when you talk.
import { useEffect, useRef } from "react";
import type { Phase } from "../_kit/MockApp";

const GAP = 26;
const INK = [238, 240, 232];
const CITRUS = [215, 242, 74];

export function SignalField({ phase, className }: { phase: Phase; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const burst = useRef(-1);

  useEffect(() => {
    if (phase === "paid") burst.current = performance.now();
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, ox = 0, oy = 0, frame = 0, energy = 0.25;

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const orb = document.querySelector<HTMLElement>('button[aria-label="Tap to talk"]')?.getBoundingClientRect();
      ox = orb ? orb.left + orb.width / 2 : w / 2;
      oy = orb ? orb.top + orb.height / 2 : h - 120;
    };

    const draw = (now: number) => {
      const t = now / 1000;
      const target = phaseRef.current === "listening" ? 1 : phaseRef.current === "card" ? 0.45 : 0.25;
      energy += (target - energy) * 0.04;
      const since = burst.current < 0 ? Infinity : (now - burst.current) / 1000;
      const ring = since * 700;
      ctx.clearRect(0, 0, w, h);
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          const d = Math.hypot(x - ox, y - oy);
          const drift = Math.sin(x * 0.012 + t * 0.6) * Math.cos(y * 0.01 - t * 0.4);
          const wave = Math.sin(d * 0.03 - t * (2 + energy * 4));
          let v = 0.35 + 0.35 * drift + energy * Math.max(0, wave) * (1 - Math.min(d / 900, 0.8));
          let col = INK;
          const hit = since < 2.2 ? Math.max(0, 1 - Math.abs(d - ring) / 60) * (1 - since / 2.2) : 0;
          if (hit > 0) { v += hit * 1.4; col = CITRUS; }
          if (energy > 0.5 && wave > 0.6) col = CITRUS;
          const r = 0.6 + Math.max(0, v) * 1.6;
          ctx.fillStyle = `rgb(${col[0]} ${col[1]} ${col[2]} / ${Math.min(0.08 + Math.max(0, v) * 0.32, 0.9)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!calm) frame = requestAnimationFrame(draw);
    };

    size();
    addEventListener("resize", size);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); removeEventListener("resize", size); };
  }, []);

  return <canvas ref={canvas} className={className} />;
}
