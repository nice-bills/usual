"use client";
// Design mock of the wallet: the same screens as /app, driven by a timer instead of the API.
// Each skin passes its own CSS module and moving background. No gradients anywhere.
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import base from "./base.module.css";

export type Phase = "idle" | "listening" | "card" | "paid";
const PHASES: Phase[] = ["idle", "listening", "card", "paid"];
const LABELS: Record<Phase, string> = { idle: "Idle", listening: "Listening", card: "Approve", paid: "Paid" };
const HOLD: Record<Phase, number> = { idle: 4200, listening: 3400, card: 3600, paid: 3800 };
const HEARD = "Send Mum her usual";
const START = 248.5;
const AMOUNT = 25;

export const MOCKS = [
  { href: "/mocks/film", name: "Film" },
  { href: "/mocks/ledger", name: "Ledger" },
  { href: "/mocks/signal", name: "Signal" },
];

type Styles = Record<string, string>;

/** Money rolls to its new value instead of swapping. */
function Rolling({ value, className }: { value: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useLayoutEffect(() => {
    const node = el.current!;
    const from = shown.current;
    shown.current = value;
    if (from === value || matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = value.toFixed(2); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      node.textContent = (from + (value - from) * (1 - (1 - p) ** 4)).toFixed(2);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span ref={el} className={className}>{value.toFixed(2)}</span>;
}

const Mic = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

function Tally({ count, className }: { count: number; className: string }) {
  return (
    <svg className={className} width="42" height="20" viewBox="0 0 28 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {Array.from({ length: Math.min(count, 4) }, (_, i) => <path key={i} pathLength={1} style={{ animationDelay: `${200 + i * 80}ms` }} d={`M${2 + i * 4} 2v12`} />)}
      {count >= 5 && <path pathLength={1} style={{ animationDelay: "560ms" }} d="M0 11 16 5" />}
      {count >= 6 && <path pathLength={1} style={{ animationDelay: "660ms" }} d="M24 2v12" />}
    </svg>
  );
}

/** Shared layout first, the skin's look layered on top under the same class names. */
const merge = (skin: Styles): Styles =>
  Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(skin)])].map((k) => [k, [base[k], skin[k]].filter(Boolean).join(" ")]));

export function MockApp({ skin, name, background, line }: { skin: Styles; name: string; background: (phase: Phase) => ReactNode; line?: ReactNode }) {
  const s = merge(skin);
  const [phase, setPhase] = useState<Phase>("idle");
  const [auto, setAuto] = useState(true);
  const [paid, setPaid] = useState(0);
  const [words, setWords] = useState(0);
  const total = HEARD.split(" ");

  // The loop: every phase holds, then hands over to the next.
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      const next = PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length];
      if (next === "paid") setPaid((n) => (n + 1) % 5);
      setPhase(next);
    }, HOLD[phase]);
    return () => clearTimeout(t);
  }, [phase, auto]);

  // Dictation: words land one at a time while listening.
  useEffect(() => {
    if (phase !== "listening") return;
    setWords(0); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(() => setWords((w) => Math.min(w + 1, total.length)), 420);
    return () => clearInterval(t);
  }, [phase, total.length]);

  const pick = (p: Phase) => {
    setAuto(false);
    if (p === "paid" && phase !== "paid") setPaid((n) => (n + 1) % 5);
    setPhase(p);
  };

  const balance = START - paid * AMOUNT;
  const showBalance = phase !== "listening";

  return (
    <div className={s.root} data-phase={phase}>
      <div className={s.bg} aria-hidden="true">{background(phase)}</div>

      <nav className={s.nav} aria-label="Mocks">
        {MOCKS.map((m, i) => (
          <Link key={m.href} href={m.href} className={s.navLink} aria-current={m.name === name ? "page" : undefined}>
            <span>{i + 1}</span>{m.name}
          </Link>
        ))}
      </nav>

      <main className={s.phone}>
        <header className={s.top}>
          <span className={s.brand}>Usual</span>
          <button className={s.menu} aria-label="Settings"><i /><i /></button>
        </header>

        <section className={s.stage} data-card={phase === "card" || phase === "paid"}>
          {showBalance && (
            <p className={s.balance} key="balance">
              <Rolling value={balance} className={s.digits} /> <span className={s.unit}>USDC</span>
            </p>
          )}

          {phase === "idle" && (line ?? (
            <article className={s.line} key="line">
              <div className={s.lineTop}><span>Usual&apos;s line</span><span>Score 72</span></div>
              <p className={s.lineAmount}>40 <span>USDC a week</span></p>
              <p className={s.lineNote}><span>Groceries</span><span>6 clean</span></p>
            </article>
          ))}

          {phase === "listening" && (
            <p className={s.heard} key="heard" aria-live="polite">
              {total.map((w, i) => <span key={i} className={s.word} data-in={i < words}>{w} </span>)}
            </p>
          )}

          {phase === "card" && (
            <article className={s.card} key="card">
              <header className={s.cardTop}><span>Understood as</span><span className={s.pill}>Within your line</span></header>
              <p className={s.amount}>25.00 <span className={s.unit}>USDC</span></p>
              <dl className={s.rows}>
                <dt>To</dt><dd>Mum</dd>
                <dt>Why</dt><dd><Tally count={6} className={s.tally} />Her usual, 6th time</dd>
                <dt>Balance after</dt><dd>{(balance - AMOUNT).toFixed(2)}</dd>
              </dl>
              <p className={s.note}>Sending in a moment</p>
              <div className={s.countdown} style={{ animationDuration: `${HOLD.card}ms` }} />
              <button className={s.ghost}>Cancel payment</button>
            </article>
          )}

          {phase === "paid" && (
            <article className={s.receipt} key="paid">
              <span className={s.check} aria-hidden="true" />
              <p className={s.said}>Sent Mum her usual.</p>
              <p className={s.total}><span>Paid</span><span>25.00 USDC</span></p>
              <dl className={s.rows}>
                <dt>To</dt><dd>Mum</dd>
                <dt>Ref</dt><dd>8f3a21c0</dd>
              </dl>
              <span className={s.stamp} aria-hidden="true">Paid</span>
            </article>
          )}
        </section>

        <footer className={s.dock}>
          <p className={s.hint} key={phase}>
            {phase === "idle" && <>Try “Send Mum the usual”</>}
            {phase === "listening" && <>Listening…</>}
            {phase === "card" && <>Inside your line, so I&apos;ll send it myself.</>}
            {phase === "paid" && <>Done. That&apos;s the 7th time.</>}
          </p>
          <button className={s.orb} data-on={phase === "listening"} aria-label="Tap to talk" onClick={() => pick(phase === "listening" ? "card" : "listening")}>
            {phase === "listening" ? <span className={s.wave}><i /><i /><i /><i /><i /></span> : <Mic />}
          </button>
          <button className={s.ghost}>Type</button>
        </footer>
      </main>

      <div className={s.switch} role="group" aria-label="Preview a state">
        {PHASES.map((p) => <button key={p} aria-pressed={p === phase} onClick={() => pick(p)}>{LABELS[p]}</button>)}
        <button aria-pressed={auto} onClick={() => setAuto((a) => !a)}>{auto ? "Pause" : "Play"}</button>
      </div>
    </div>
  );
}
