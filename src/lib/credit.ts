// You are the bank; your agent is the borrower. Its score is worked out from verdicts in your memory,
// and its credit lines are real allowances on Sui. Every other fintech scores you. This one you score.
import type { Category, State } from "./records";

const START = 20;
const CLEAN = 8;

export type CreditReport = { score: number; clean: number; wrong: number; suspended: Category[] };

/** Clean payments build slowly; one mistake halves it. Trust is lost faster than it's earned, on purpose. */
export function creditReport(s: State): CreditReport {
  const verdicts = [...s.verdicts].sort((a, b) => a.at - b.at);
  const score = verdicts.reduce((n, v) => (v.outcome === "clean" ? Math.min(100, n + CLEAN) : Math.floor(n / 2)), START);
  const categories = [...new Set(verdicts.map((v) => v.category))];
  return {
    score,
    clean: verdicts.filter((v) => v.outcome === "clean").length,
    wrong: verdicts.filter((v) => v.outcome === "wrong").length,
    suspended: categories.filter((c) => suspended(s, c)),
  };
}

/** A mistake takes away the line until the owner signs a new one. */
export function suspended(s: State, category: Category) {
  const signed = (s.limits[category] as { v?: number } | undefined)?.v ?? 0;
  return s.verdicts.some((v) => v.category === category && v.outcome === "wrong" && v.at > signed);
}

/** Clean payments on a category since its line was last signed. */
export function cleanSinceLine(s: State, category: Category) {
  const signed = (s.limits[category] as { v?: number } | undefined)?.v ?? 0;
  return s.verdicts.filter((v) => v.category === category && v.outcome === "clean" && v.at > signed).length;
}
