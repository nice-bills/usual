// Pure money logic: recurring-payee inference, limit checks, intent validation.
import { formatAmount, parseAmount } from "./money";
import { categoryFor, resolveContact, type Category, type Contact, type State } from "./records";

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
};
export type Validation = { ok: true; plan: Plan } | { ok: false; ask: string };

/** The LLM proposes, this disposes. Any ambiguity becomes a question. */
export function validateIntent(s: State, intent: Intent, now = Date.now()): Validation {
  const r = resolveContact(s, intent.to);
  if (r.kind === "none") return { ok: false, ask: `Who's ${intent.to}?` };
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
  } else if (usual) {
    amount = parseAmount(usual.amount);
    reason = usual.count ? `like the last ${usual.count} times` : "your usual";
  }
  if (amount == null) return { ok: false, ask: `How much should I send ${contact.name}? I don't know a usual amount yet.` };
  const category = categoryFor(s, contact.address);
  return { ok: true, plan: { contact, amount, amountText: formatAmount(amount), category, reason, limit: checkLimit(s, category, amount, now) } };
}
