"use client";

// The credit Usual has earned, as a printed card. Like a banknote, the richness is ink on hard-edged
// colour blocks: engraved linework, no gradients. A wrong payment cuts it in two.
const W = 342;
const H = 216;

function rosette(cx: number, cy: number, radius: number, lobes: number, depth: number) {
  const steps = 240;
  const points = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + depth * Math.sin(lobes * t);
    return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  });
  return `M${points.join("L")}Z`;
}
const ENGRAVING = Array.from({ length: 9 }, (_, i) => rosette(262, 66, 30 + i * 13, 12, 7 + i));

function Print() {
  return (
    <svg className="agent-print" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <rect width={W} height={H} fill="#e8ee4b" />
      <path d="M0 150 196 0h66L0 202Z" fill="#fbf9f0" />
      <path d="M0 202 262 0h80v70L128 216H0Z" fill="#ff7a50" />
      <path d="M128 216 342 70v146Z" fill="#2f7a5c" />
      <g fill="none" stroke="#0a3a2a" strokeWidth="0.6" opacity="0.5">{ENGRAVING.map((d) => <path key={d} d={d} />)}</g>
    </svg>
  );
}

export type Line = { category: string; amount: string; period: string };

export function AgentCard({ score, clean, line, suspended, symbol }: { score: number; clean: number; line: Line | null; suspended: boolean; symbol: string }) {
  if (!line) {
    return (
      <article className="agent-card unissued" aria-label={`No credit line yet. Score ${score} of 100.`}>
        <div className="agent-top"><span>Usual</span><span>Score {score}</span></div>
        <p className="agent-limit">0</p>
        <p className="agent-note">Not issued. I have to earn this.</p>
      </article>
    );
  }
  const face = (
    <>
      <Print />
      <div className="agent-top"><span>Usual</span><span>Score {score}</span></div>
      <p className="agent-limit">{line.amount} <span>{symbol} a {line.period}</span></p>
      <p className="agent-note"><span>{line.category}</span><span>{clean} clean</span></p>
    </>
  );
  if (!suspended) return <article className="agent-card" aria-label={`Credit line: ${line.amount} ${symbol} a ${line.period} for ${line.category}. Score ${score} of 100.`}>{face}</article>;
  return (
    <article className="agent-card cut" aria-label={`Credit line for ${line.category} suspended. Score ${score} of 100.`}>
      <div className="half left" aria-hidden="true">{face}</div>
      <div className="half right" aria-hidden="true">{face}</div>
      <p className="agent-suspended">Suspended</p>
    </article>
  );
}
