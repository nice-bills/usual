// Memory records: one fact per Walrus memory. A plain sentence for semantic recall,
// then " || " and one JSON line the app reduces into state. Newest `v` wins per key.

import { env } from "./env";

export type Category = "family" | "food" | "subscriptions" | "transport" | "shopping" | "other";
export const CATEGORIES: Category[] = ["family", "food", "subscriptions", "transport", "shopping", "other"];

export type Rec =
  | { type: "CONTACT"; name: string; address: string; relation?: string; aliases?: string[]; source: "chain+user" | "user"; removed?: boolean }
  | { type: "USUAL"; name: string; amount: string; count?: number; removed?: boolean }
  | { type: "LIMIT"; category: Category; amount: string; periodDays: number; allowanceId?: string; capId?: string }
  | { type: "SUBSCRIPTION"; name: string; address: string; amount: string; previousAmount?: string; cadenceDays: number; lastAt: number; cancelled?: boolean; removed?: boolean }
  | { type: "PAYMENT"; to: string; name?: string; amount: string; digest: string; category: Category; at: number; via: "agent" | "owner" | "mpp" }
  | { type: "CORRECTION"; note: string }
  | { type: "PREFERENCE"; key: string; value: string }
  | { type: "CATEGORY"; address: string; category: Category }
  | { type: "MENTION"; name: string; at: number }
  | { type: "DEPOSIT"; amount: string; digest: string; at: number }
  | { type: "VERDICT"; category: Category; outcome: "clean" | "wrong"; name?: string; digest: string; at: number };

export type Stamped = Rec & { v: number };

export function keyOf(r: Rec): string {
  switch (r.type) {
    case "CONTACT": case "USUAL": case "MENTION": return `${r.type}:${r.name.toLowerCase()}`;
    case "LIMIT": return `LIMIT:${r.category}`;
    case "SUBSCRIPTION": case "CATEGORY": return `${r.type}:${r.address}`;
    case "PAYMENT": return `PAYMENT:${r.digest}`;
    case "DEPOSIT": return `DEPOSIT:${r.digest}`;
    case "VERDICT": return `VERDICT:${r.digest}`;
    case "PREFERENCE": return `PREFERENCE:${r.key}`;
    case "CORRECTION": return `CORRECTION:${r.note}`;
  }
}

export function sentence(r: Rec): string {
  switch (r.type) {
    case "CONTACT": return `Contact: ${r.name}${r.relation ? ` is the user's ${r.relation}` : ""}, wallet ${r.address}.`;
    case "USUAL": return `Usual payment: the user usually sends ${r.name} ${r.amount} ${env.symbol}.`;
    case "LIMIT": return `Spending limit: ${r.category} is capped at ${r.amount} ${env.symbol} every ${r.periodDays} days.`;
    case "SUBSCRIPTION": return `Subscription: ${r.name} charges ${r.amount} ${env.symbol} every ${r.cadenceDays} days${r.previousAmount ? `, up from ${r.previousAmount}` : ""}.`;
    case "PAYMENT": return `Payment: sent ${r.amount} ${env.symbol} to ${r.name ?? r.to} for ${r.category}, tx ${r.digest}.`;
    case "CORRECTION": return `Correction from the user: ${r.note}`;
    case "PREFERENCE": return `Preference: ${r.key} is ${r.value}.`;
    case "CATEGORY": return `Spending category: payments to ${r.address} count as ${r.category}.`;
    case "MENTION": return `Mention: the user talked about ${r.name}.`;
    case "VERDICT": return `Verdict: the user marked a ${r.category} payment${r.name ? ` to ${r.name}` : ""} as ${r.outcome}.`;
    case "DEPOSIT": return `Deposit: the user added ${r.amount} ${env.symbol} to their balance.`;
  }
}

export const encode = (r: Stamped) => `${sentence(r)} || ${JSON.stringify(r)}`;

export function decode(text: string): Stamped | null {
  const i = text.lastIndexOf(" || ");
  if (i < 0) return null;
  try {
    const r = JSON.parse(text.slice(i + 4));
    return r && typeof r.type === "string" && typeof r.v === "number" ? (r as Stamped) : null;
  } catch {
    return null;
  }
}

export type Contact = Extract<Rec, { type: "CONTACT" }>;
export type State = {
  contacts: Record<string, Contact>;
  usuals: Record<string, Extract<Rec, { type: "USUAL" }>>;
  limits: Partial<Record<Category, Extract<Rec, { type: "LIMIT" }>>>;
  subscriptions: Record<string, Extract<Rec, { type: "SUBSCRIPTION" }>>;
  payments: Extract<Rec, { type: "PAYMENT" }>[];
  categories: Record<string, Category>;
  prefs: Record<string, string>;
  corrections: string[];
  mentions: Record<string, number>;
  verdicts: Extract<Rec, { type: "VERDICT" }>[];
  count: number;
};

/** Fold records into state. Records may arrive in any order and duplicated. */
export function reduce(recs: Stamped[]): State {
  const latest = new Map<string, Stamped>();
  for (const r of recs) {
    const k = keyOf(r);
    const cur = latest.get(k);
    if (!cur || r.v >= cur.v) latest.set(k, r);
  }
  const s: State = { contacts: {}, usuals: {}, limits: {}, subscriptions: {}, payments: [], categories: {}, prefs: {}, corrections: [], mentions: {}, verdicts: [], count: recs.length };
  for (const r of latest.values()) {
    switch (r.type) {
      case "CONTACT": if (!r.removed) s.contacts[r.name.toLowerCase()] = r; break;
      case "USUAL": if (!r.removed) s.usuals[r.name.toLowerCase()] = r; break;
      case "LIMIT": s.limits[r.category] = r; break;
      case "SUBSCRIPTION": if (!r.removed) s.subscriptions[r.address] = r; break;
      case "PAYMENT": s.payments.push(r); break;
      case "CATEGORY": s.categories[r.address] = r.category; break;
      case "PREFERENCE": s.prefs[r.key] = r.value; break;
      case "CORRECTION": s.corrections.push(r.note); break;
      case "MENTION": s.mentions[r.name.toLowerCase()] = r.at; break;
      case "VERDICT": s.verdicts.push(r); break;
    }
  }
  s.payments.sort((a, b) => b.at - a.at);
  return s;
}

export type Resolved = { kind: "one"; contact: Contact } | { kind: "many"; options: Contact[] } | { kind: "none" };

const SAME = [["mum", "mom", "mam", "mother", "mummy", "mommy", "ma"], ["dad", "father", "daddy", "papa", "pa"]];
const spellings = (n: string) => SAME.find((g) => g.includes(n)) ?? [n];

/** Find a contact by name or alias. Exact match first, then a whole first name or clear prefix. Never a guess. */
export function resolveContact(s: State, name: string): Resolved {
  const q = name.trim().toLowerCase().replace(/^(my|to)\s+/, "").replace(/'s$/, "");
  const all = Object.values(s.contacts);
  const names = (c: Contact) => [c.name, ...(c.aliases ?? [])].map((n) => n.toLowerCase()).flatMap((n) => [n, ...n.split(" ")]).flatMap(spellings);
  const exact = all.filter((c) => names(c).includes(q));
  if (exact.length === 1) return { kind: "one", contact: exact[0] };
  if (exact.length > 1) return { kind: "many", options: exact };
  const fuzzy = all.filter((c) => names(c).some((n) => n.split(" ")[0] === q || (q.length >= 3 && n.startsWith(q))));
  if (fuzzy.length === 1) return { kind: "one", contact: fuzzy[0] };
  return fuzzy.length ? { kind: "many", options: fuzzy } : { kind: "none" };
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** A contact one letter away from what was heard, to confirm and never to pay directly. */
export function nearContact(s: State, name: string): Contact | undefined {
  const q = name.trim().toLowerCase();
  if (q.length < 3 || q.includes(" ")) return undefined;
  const near = Object.values(s.contacts).filter((c) => distance(q, c.name.toLowerCase().split(" ")[0]) === 1);
  return near.length === 1 ? near[0] : undefined;
}

export const nameForAddress = (s: State, address: string) => Object.values(s.contacts).find((c) => c.address === address)?.name;

export function categoryFor(s: State, address: string): Category {
  if (s.categories[address]) return s.categories[address];
  if (s.subscriptions[address]) return "subscriptions";
  const c = Object.values(s.contacts).find((c) => c.address === address);
  return c?.relation ? "family" : "other";
}
