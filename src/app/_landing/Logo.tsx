import type { CSSProperties } from "react";
import s from "./landing.module.css";

// Monochrome brand marks from /public/logos, painted in currentColor through a mask.
export function Logo({ name, className = "" }: { name: string; className?: string }) {
  const url = `url(/logos/${name}.svg)`;
  return <span className={`${s.logo} ${className}`} style={{ maskImage: url, WebkitMaskImage: url } as CSSProperties} aria-hidden="true" />;
}

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
      <path d="M20 16v32M28 16v32M36 16v32M44 16v32M12 42 52 22" />
    </svg>
  );
}

export function Cube({ variant }: { variant: "solid" | "nested" | "grid" | "broken" }) {
  return (
    <svg className={s.cube} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" aria-hidden="true" strokeDasharray={variant === "broken" ? "3 2.5" : undefined}>
      <path d="M24 5 41 14.5v19L24 43 7 33.5v-19z" />
      <path d="M7 14.5 24 24l17-9.5M24 24v19" />
      {variant === "nested" && <g opacity=".7"><path d="M24 17.5 31 21.5v8L24 33.5l-7-4v-8z" /><path d="M17 21.5 24 25.5l7-4M24 25.5v8" /></g>}
      {variant === "grid" && <g opacity=".55"><path d="M15.5 9.75 32.5 19.25M32.5 9.75 15.5 19.25M15.5 19.25v19M32.5 19.25v19M7 24l17 9.5 17-9.5" /></g>}
    </svg>
  );
}
