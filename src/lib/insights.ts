// Pure money logic: recurring-payee inference, limit checks, intent validation.
import { cleanSinceLine, suspended } from "./credit";
import { formatAmount, parseAmount } from "./money";
import { categoryFor, nearContact, resolveContact, type Category, type Contact, type State } from "./records";

export type ChainPayment = { to: string; amount: bigint; digest: string; at: number };

export type Recurring = {
  address: string;
  count: number;
  usual: bigint; // most frequent amount
  last: bigint;
  previous?: bigint; // set when the latest amount differs from the usual
  cadenceDays: number; // median gap
  lastAt: number;
};

const DAY = 86_400_000;

/** Group outgoing payments by payee; payees paid at least twice are recurring. */
export function inferRecurring(payments: ChainPayment[]): Recurring[] {
  const by = new Map<string, ChainPayment[]>();
  for (const p of payments) by.set(p.to, [...(by.get(p.to) ?? []), p]);
  const out: Recurring[] = [];
  for (const [address, ps] of by) {
    if (ps.length < 2) continue;
    ps.sort((a, b) => a.at - b.at);
    const freq = new Map<bigint, number>();
    for (const p of ps) freq.set(p.amount, (freq.get(p.amount) ?? 0) + 1);
    const usual = [...freq].sort((a, b) => b[1] - a[1] || Number(b[0] - a[0]))[0][0];
    const gaps = ps.slice(1).map((p, i) => p.at - ps[i].at).sort((a, b) => a - b);
    const last = ps[ps.length - 1].amount;
    out.push({
      address,
      count: ps.length,
      usual,
      last,
      previous: last !== usual ? usual : undefined,
      cadenceDays: Math.max(0, Math.round(gaps[Math.floor(gaps.length / 2)] / DAY * 10) / 10),
      lastAt: ps[ps.length - 1].at,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export type Belief = { usual: bigint; matches: number; total: number; confidence: number; seen: bigint[] };

/** What the last six payments to a payee support, with the evidence to show the user. */
export function beliefFor(hist: ChainPayment[], address: string): Belief | null {
  const recent = hist.filter((p) => p.to === address).sort((a, b) => b.at - a.at).slice(0, 6);
  if (!recent.length) return null;
  const freq = new Map<bigint, number>();
  for (const p of recent) freq.set(p.amount, (freq.get(p.amount) ?? 0) + 1);
  const [usual, matches] = [...freq].sort((a, b) => b[1] - a[1])[0];
  return { usual, matches, total: recent.length, confidence: matches / recent.length, seen: [...freq.keys()] };
}

/** Teens and tens sound alike: 15/50, 13/30. A spoken amount like this is checked, not trusted. */
export function confusable(a: bigint, b: bigint): boolean {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const unit = 1_000_000n;
  if (lo % unit || hi % unit) return false;
  const [l, h] = [lo / unit, hi / unit];
  return l >= 13n && l <= 19n && h === (l - 10n) * 10n;
}

/** Limits learned from behaviour: a category with spending and no limit gets a proposed one. */
export function suggestLimit(s: State, hist: ChainPayment[], now = Date.now()) {
  const PERIOD: Partial<Record<Category, number>> = { family: 7, food: 1, subscriptions: 30, transport: 7 };
  const nice = (v: bigint) => { const u = 1_000_000n; return ((v + u - 1n) / u) * u; };
  for (const [category, periodDays] of Object.entries(PERIOD) as [Category, number][]) {
    if (s.limits[category]) continue;
    const spent = hist.filter((p) => categoryFor(s, p.to) === category);
    if (!spent.length) continue;
    const base = category === "subscriptions"
      ? Object.values(s.subscriptions).filter((x) => !x.cancelled).reduce((t, x) => t + (parseAmount(x.amount) ?? 0n), 0n)
      : spent.reduce((m, p) => (p.amount > m ? p.amount : m), 0n);
    if (base > 0n) return { category, amount: formatAmount(nice((base * 6n) / 5n)), periodDays };
  }
  // Repeated approvals above a limit mean the limit is wrong: propose raising it.
  for (const [category, l] of Object.entries(s.limits) as [Category, NonNullable<State["limits"][Category]>][]) {
    const over = s.payments.filter((p) => p.category === category && p.via === "owner" && p.at >= now - 30 * DAY);
    // Three clean payments on a line earn a bigger one, as long as no mistake is outstanding.
    if (over.length < 2 && cleanSinceLine(s, category) < 3) continue;
    if (suspended(s, category)) continue;
    const top = over.reduce((m, p) => { const a = parseAmount(p.amount) ?? 0n; return a > m ? a : m; }, parseAmount(l.amount) ?? 0n);
    return { category, amount: formatAmount(nice((top * 6n) / 5n)), periodDays: l.periodDays, raise: true };
  }
  return null;
}

/** Spent in the current fixed window for a category, from remembered payments. */
export function spentInWindow(s: State, category: Category, periodDays: number, now = Date.now()): bigint {
  const since = now - periodDays * DAY;
  return s.payments
    .filter((p) => p.category === category && p.at >= since && p.via !== "owner")
    .reduce((sum, p) => sum + (parseAmount(p.amount) ?? 0n), 0n);
}

export type LimitCheck =
  | { ok: true; category: Category; remaining: bigint | null; allowanceId?: string }
  | { ok: false; category: Category; remaining: bigint; limit: bigint };

/** Within limit => the agent key may pay (via the category allowance if one exists). Otherwise the owner signs. */
export function checkLimit(s: State, category: Category, amount: bigint, now = Date.now()): LimitCheck {
  const l = s.limits[category];
  if (!l) return { ok: true, category, remaining: null };
  const limit = parseAmount(l.amount) ?? 0n;
  const remaining = limit - spentInWindow(s, category, l.periodDays, now);
  return amount <= remaining
    ? { ok: true, category, remaining: remaining - amount, allowanceId: l.allowanceId }
    : { ok: false, category, remaining: remaining < 0n ? 0n : remaining, limit };
}

export type Intent = { to: string; amount?: string | number | null; useUsual?: boolean };
export type Plan = {
  contact: Contact;
  amount: bigint;
  amountText: string;
  category: Category;
  reason: string;
  limit: LimitCheck;
  guard?: string; // why this needs the owner even inside a limit
};
export type Validation = { ok: true; plan: Plan } | { ok: false; ask: string; retry?: Intent };

/** The LLM proposes, this disposes. Any ambiguity becomes a question. */
export function validateIntent(s: State, intent: Intent, now = Date.now(), hist?: ChainPayment[]): Validation {
  const r = resolveContact(s, intent.to);
  if (r.kind === "none") {
    const near = nearContact(s, intent.to);
    return near ? { ok: false, ask: `Did you mean ${near.name}?`, retry: { ...intent, to: near.name } } : { ok: false, ask: `Who's ${intent.to}?` };
  }
  if (r.kind === "many") return { ok: false, ask: `Which ${intent.to}? ${r.options.map((c) => c.name).join(" or ")}?` };
  const contact = r.contact;
  const cancelled = s.subscriptions[contact.address]?.cancelled;
  if (cancelled) return { ok: false, ask: `You cancelled ${contact.name}. I won't pay it unless you set it up again.` };
  const usual = s.usuals[contact.name.toLowerCase()];
  let amount: bigint | null = null;
  let reason = "";
  if (intent.amount != null && intent.amount !== "") {
    amount = parseAmount(intent.amount);
    if (amount == null) return { ok: false, ask: `How much should I send ${contact.name}?` };
    const known = usual ? parseAmount(usual.amount) : null;
    if (known && confusable(amount, known)) return { ok: false, ask: `Did you say ${formatAmount(amount)} or ${formatAmount(known)}? Say it once more with “dollars”, or “the usual”.`, retry: { to: contact.name, amount: formatAmount(known) } };
  } else if (usual) {
    amount = parseAmount(usual.amount);
    const b = hist && beliefFor(hist, contact.address);
    if (b && b.total >= 3 && b.confidence < 0.5) return { ok: false, ask: `How much? Lately it's been ${b.seen.map(formatAmount).join(", ")}.` };
    reason = b ? (b.matches === b.total ? `like the last ${b.total} times` : `${b.matches} of the last ${b.total} times`) : usual.count ? `like the last ${usual.count} times` : "your usual";
  }
  if (amount == null) return { ok: false, ask: `How much should I send ${contact.name}? I don't know a usual amount yet.` };
  const category = categoryFor(s, contact.address);
  // Fraud checks: inside a limit is not enough for a first payment or a far larger one than normal.
  const b = hist ? beliefFor(hist, contact.address) : undefined;
  const guard = b === null ? "First payment to this wallet" : b && amount > b.usual * 2n ? "Much more than usual" : undefined;
  return { ok: true, plan: { contact, amount, amountText: formatAmount(amount), category, reason, limit: checkLimit(s, category, amount, now), guard } };
}
