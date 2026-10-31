// Outside judge for "the usual": replay held-out payments. Each payee's history is walked forward; at each
// step Usual sees only the past and either predicts the next amount or asks. Data is synthetic and seeded.
import { beliefFor, type ChainPayment } from "../src/lib/insights";

let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (xs: number[]) => xs[Math.floor(rnd() * xs.length)];
const usdc = (n: number) => BigInt(Math.round(n * 1e6));

function payee(kind: string, n: number): bigint[] {
  const base = pick([5, 10, 12, 20, 30, 50, 100]);
  return Array.from({ length: n }, (_, i) => {
    if (kind === "stable") return usdc(rnd() < 0.08 ? base * pick([0.5, 2]) : base);
    if (kind === "riser") return usdc(i < n / 2 ? base : base + 5);
    if (kind === "two") return usdc(rnd() < 0.5 ? base : base * 2);
    return usdc(base * (0.5 + rnd()));
  });
}

const score = { steps: 0, asked: 0, right: 0, wrong: 0, baselineRight: 0 };
for (const [kind, count] of [["stable", 60], ["riser", 20], ["two", 10], ["noisy", 10]] as const) {
  for (let c = 0; c < count; c++) {
    const amounts = payee(kind, 24);
    for (let i = 3; i < amounts.length; i++) {
      const hist: ChainPayment[] = amounts.slice(0, i).map((amount, t) => ({ to: "x", amount, digest: `${t}`, at: t }));
      const b = beliefFor(hist, "x")!;
      score.steps++;
      if (amounts[i] === amounts[i - 1]) score.baselineRight++;
      if (b.confidence < 0.5) score.asked++;
      else if (b.usual === amounts[i]) score.right++;
      else score.wrong++;
    }
  }
}
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
const acted = score.right + score.wrong;
console.log(`steps ${score.steps}
acted without asking: ${pct(acted, score.steps)}
correct when acting: ${pct(score.right, acted)}
asked instead of guessing: ${pct(score.asked, score.steps)}
baseline (repeat last amount): ${pct(score.baselineRight, score.steps)}`);
