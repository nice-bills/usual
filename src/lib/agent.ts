// The executor. Parsed Actions are proposals; everything here is validated against what
// Walrus Memory says and what the limits allow before any money moves.
import { creditReport, suspended } from "./credit";
import { env } from "./env";
import { checkLimit, inferRecurring, suggestLimit, validateIntent, type ChainPayment, type Recurring } from "./insights";
import { load, memoryOn, ownedAccount, recallAbout, remember } from "./memory";
import { formatAmount, formatBalance, parseAmount, shortAddr } from "./money";
import { answerFrom, confirmLine, notAName, parse, type Action } from "./parse";
import { categoryFor, nameForAddress, reduce, resolveContact, type Category, type Rec, type Stamped, type State } from "./records";
import * as wallet from "./wallet";

const DAY = 86_400_000;
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : n === 3 ? "three times" : `${n} times`);
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export type Question = { address: string; text: string; count: number; usual: string };

export type Proposal =
  | { type: "pay"; to: string; name: string; address: string; amount: string; category: Category; path: wallet.Path; balanceAfter: string; simulated: boolean; reason: string; overLimit?: string }
  | { type: "limit"; category: Category; amount: string; periodDays: number }
  | { type: "cafe"; item: string; label: string; amount: string; path: wallet.Path; overLimit?: string; balanceAfter: string };

export type Insight = { rows: { label: string; value: string }[]; note?: string };

export type Reply = {
  heard: string;
  by: "rules" | "llm";
  action: Action;
  say: string;
  understood?: string;
  proposal?: Proposal;
  insight?: Insight;
  undo?: Rec[]; // records that put memory back as it was; payments have no undo
  asking?: Question | null;
  followUp?: Action | null;
  remembered: number;
  memoryError?: string;
};

/** Unnamed recurring payees from chain history become "Who's that?" questions. */
export function questionsFrom(history: ChainPayment[], s: State, skip: string[] = []): Question[] {
  const known = new Set(Object.values(s.contacts).map((c) => c.address));
  return inferRecurring(history)
    .filter((r) => !known.has(r.address) && !skip.includes(r.address) && r.address !== wallet.cafeAddress())
    .sort((a, b) => (a.usual === b.usual ? 0 : a.usual > b.usual ? -1 : 1)) // Biggest first: those are the ones people recognise.
    .map((r) => ({
      address: r.address,
      count: r.count,
      usual: formatAmount(r.usual),
      text: `You've sent someone ${formatAmount(r.usual)} ${env.symbol} ${times(r.count)}. Who's that?`,
    }));
}

export async function snapshot(fresh = false, skip: string[] = []) {
  const [mem, bal, hist, loose] = await Promise.all([load(fresh), wallet.balance(), wallet.history(), wallet.looseBalance()]);
  return {
    owner: wallet.owner(),
    memoryOn: memoryOn(),
    credit: creditReport(mem.state),
    symbol: env.symbol,
    balance: formatBalance(bal),
    // Arrived but not yet where limits can spend it.
    loose: loose ? formatAmount(loose) : null,
    memory: { count: mem.records.length, source: mem.source, pending: mem.pending, error: mem.error, account: ownedAccount() },
    state: mem.state,
    questions: questionsFrom(hist, mem.state, skip),
    // From the chain, not memory: this stays true even when a memory write failed.
    activity: hist.slice(0, 8).map((p) => ({ name: nameForAddress(mem.state, p.to) ?? (p.to === wallet.cafeAddress() ? "Café" : "Someone"), amount: formatAmount(p.amount), digest: p.digest })),
  };
}

export type TalkContext = { asking?: Question | null; followUp?: Action | null; skip?: string[]; text?: string };

export async function talk(text: string, ctx: TalkContext): Promise<Reply> {
  const mem = await load();
  const s = mem.state;
  const yes = /^(yes|yeah|yep|sure|ok(ay)?|do it|go ahead|please do)\b/i.test(text.trim());
  const { action, by } = yes && ctx.followUp
    ? { action: ctx.followUp, by: "rules" as const }
    : await parse(text, { asking: ctx.asking, contacts: Object.values(s.contacts).map((c) => c.name) });
  const base = { heard: text, by, action, remembered: 0, memoryError: mem.error };
  const check = by === "llm" ? confirmLine(action) : null;
  if (check) return { ...base, say: check, followUp: action };
  const out = await run(action, s, { ...ctx, text });
  return { ...base, ...out };
}

/** Runs one typed action directly, for callers that are not speech, like the MCP connector. */
export async function act(action: Action, ctx: TalkContext = {}) {
  return run(action, (await load()).state, ctx);
}

type Out = Omit<Reply, "heard" | "by" | "action" | "memoryError">;

async function write(recs: Rec[]) {
  const r = await remember(recs);
  return r.stored.length;
}

async function run(a: Action, s: State, ctx: TalkContext): Promise<Out> {
  switch (a.kind) {
    case "name": return name(a, s, ctx);
    case "pay": return pay(a, s);
    case "skip": {
      const skip = [...(ctx.skip ?? []), ...(ctx.asking ? [ctx.asking.address] : [])];
      const next = questionsFrom(await wallet.history(), s, skip)[0] ?? null;
      return { say: next ? "OK, skipping that one." : "OK. That's everyone for now.", asking: next, remembered: 0 };
    }
    case "forget": {
      const r = resolveContact(s, a.name);
      if (r.kind !== "one") return { say: r.kind === "none" ? `I don't know a ${a.name}.` : `Which ${a.name}?`, remembered: 0 };
      const c = r.contact;
      const usual = s.usuals[c.name.toLowerCase()];
      const sub = s.subscriptions[c.address];
      const n = await write([{ ...c, removed: true }, ...(usual ? [{ ...usual, removed: true }] : []), ...(sub ? [{ ...sub, removed: true }] : [])]);
      const contacts = Object.fromEntries(Object.entries(s.contacts).filter(([, x]) => x.address !== c.address));
      const next = questionsFrom(await wallet.history(), { ...s, contacts }, ctx.skip ?? [])[0] ?? null;
      return { say: `Forgotten. ${c.name} is gone from your memory.`, asking: next, undo: [c, ...(usual ? [usual] : []), ...(sub ? [sub] : [])], remembered: n };
    }
    case "set_usual": {
      const r = resolveContact(s, a.to);
      const amount = parseAmount(a.amount);
      if (r.kind !== "one") return { say: r.kind === "none" ? `Who's ${a.to}?` : `Which ${a.to}?`, remembered: 0 };
      if (amount == null) return { say: `How much is ${r.contact.name}'s usual?`, remembered: 0 };
      const n = await write([{ type: "USUAL", name: r.contact.name, amount: formatAmount(amount) }, { type: "MENTION", name: r.contact.name, at: Date.now() }]);
      return { say: `Got it. ${r.contact.name}'s usual is ${formatAmount(amount)} ${env.symbol} now.`, remembered: n };
    }
    case "set_limit": {
      const amount = parseAmount(a.amount);
      if (amount == null || !a.periodDays) return { say: "What should the limit be, and per day, week or month?", remembered: 0 };
      const per = a.periodDays === 1 ? "day" : a.periodDays === 7 ? "week" : a.periodDays === 30 ? "month" : `${a.periodDays} days`;
      return {
        say: `Sign once and the chain will hold me to ${formatAmount(amount)} ${env.symbol} a ${per} on ${a.category}.`,
        understood: `${a.category} limit · ${formatAmount(amount)} ${env.symbol} per ${per} · enforced by a Sui allowance`,
        proposal: { type: "limit", category: a.category, amount: formatAmount(amount), periodDays: a.periodDays },
        remembered: 0,
      };
    }
    case "summary": return summary(s);
    case "mistake": return mistake(s);
    case "statement": return statement(s);
    case "subscriptions": {
      const subs = Object.values(s.subscriptions).filter((x) => !x.cancelled);
      if (!subs.length) return { say: "I don't know any subscriptions yet.", remembered: 0 };
      const total = subs.reduce((t, x) => t + (parseAmount(x.amount) ?? 0n), 0n);
      return {
        say: `${subs.map((x) => `${x.name} ${x.amount}`).join(", ")}. About ${formatAmount(total)} ${env.symbol} a month.`,
        insight: { rows: subs.map((x) => ({ label: x.name, value: x.amount })), note: `About ${formatAmount(total)} ${env.symbol} a month.` },
        remembered: 0,
      };
    }
    case "cancel": {
      const sub = Object.values(s.subscriptions).find((x) => x.name.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(x.name.toLowerCase()));
      if (!sub) return { say: `I don't see a subscription called ${a.name}.`, remembered: 0 };
      const n = await write([{ ...sub, cancelled: true }, { type: "MENTION", name: sub.name, at: Date.now() }]);
      return { say: `Done. ${sub.name} is marked cancelled, and I'll stop any payment to it.`, undo: [sub], remembered: n };
    }
    case "balance": {
      const bal = await wallet.balance();
      return { say: `You have ${formatBalance(bal)} ${env.symbol}.`, remembered: 0 };
    }
    case "cafe": return cafeProposal(a.item ?? "flat-white", s);
    case "remember": {
      const n = await write([{ type: "CORRECTION", note: a.note }]);
      return { say: "Noted. I'll remember that.", remembered: n };
    }
    default:
      return ask(a.kind === "unknown" ? a.say : undefined, ctx.text);
  }
}

/** Anything that isn't a command goes to memory: Walrus recalls by meaning, and the reply can only use what came back. */
async function ask(llmSay: string | undefined, text?: string): Promise<Out> {
  // "Got it" and "wait a minute" aren't questions, and answering them from memory sounds unhinged.
  const question = !!text && (text.trim().endsWith("?") || /^(what|when|where|who|why|how|which|did|do|does|is|are|am|can|have|has|tell me)\b/i.test(text.trim()));
  if (!question) return { say: llmSay ?? "OK.", remembered: 0 };
  const memories = await recallAbout(text);
  const say = memories.length ? await answerFrom(text, memories) : null;
  return { say: say ?? "I don't have anything on that yet. Tell me and I'll remember.", remembered: 0 };
}

/** The owner calls a payment wrong: the score drops, the line stops at once, and a signature makes the cut real on-chain. */
async function mistake(s: State): Promise<Out> {
  const last = s.payments[0];
  if (!last) return { say: "I haven't paid anyone yet.", remembered: 0 };
  const n = await write([{ type: "VERDICT", category: last.category, outcome: "wrong", name: last.name, digest: `wrong-${last.digest}`, at: Date.now() }]);
  const after = { ...s, verdicts: [...s.verdicts, { type: "VERDICT" as const, category: last.category, outcome: "wrong" as const, digest: last.digest, at: Date.now() }] };
  const { score } = creditReport(after);
  const line = s.limits[last.category];
  const cut = line ? (parseAmount(line.amount) ?? 0n) / 2n : 0n;
  const followUp: Action | null = line && cut ? { kind: "set_limit", category: last.category, amount: formatAmount(cut), periodDays: line.periodDays } : null;
  return {
    say: `That's on me. My score is down to ${score}, and I won't pay ${last.category} on my own.${followUp ? ` Want to cut my line to ${formatAmount(cut)}?` : ""}`,
    followUp,
    remembered: n,
  };
}

function statement(s: State): Out {
  const r = creditReport(s);
  const lines = Object.values(s.limits).map((l) => ({ label: `${l.category}${r.suspended.includes(l.category) ? " (suspended)" : ""}`, value: `${l.amount} a ${l.periodDays === 1 ? "day" : l.periodDays === 7 ? "week" : "month"}` }));
  const note = `${r.clean} clean, ${r.wrong} wrong. You score me; I don't score you.`;
  return { say: `My score is ${r.score}. ${note}`, insight: { rows: lines.length ? lines : [{ label: "No credit line yet", value: "0" }], note: `Score ${r.score}. ${note}` }, remembered: 0 };
}

async function name(a: Extract<Action, { kind: "name" }>, s: State, ctx: TalkContext): Promise<Out> {
  const q = ctx.asking;
  if (notAName(a.name)) return { say: q ? `Sorry, who's that? ${q.text}` : "Sorry, say that again.", asking: q ?? undefined, remembered: 0 };
  // Renaming a second wallet to a known name would silently redirect that person's payments.
  const taken = s.contacts[a.name.toLowerCase()];
  if (q && taken && taken.address !== q.address) return { say: `You already have a ${taken.name} at ${shortAddr(taken.address)}. What's a different name for this one?`, asking: q, remembered: 0 };
  if (!q) return { say: `Who should ${a.name} be? Tell me when I ask about a wallet.`, remembered: 0 };
  const hist = await wallet.history();
  const rec = inferRecurring(hist).find((r) => r.address === q.address);
  if (!rec) return { say: "I lost track of that wallet. Ask me again.", remembered: 0, asking: null };
  const category = a.category ?? (a.relation ? "family" : undefined);
  const recs: Rec[] = [{ type: "CONTACT", name: a.name, address: q.address, relation: a.relation, source: "chain+user" }];
  let say: string;
  if (category === "subscriptions" || (!a.relation && rec.cadenceDays >= 25)) {
    recs.push(subscription(a.name, rec), { type: "CATEGORY", address: q.address, category: "subscriptions" });
    say = `${a.name}: ${formatAmount(rec.last)} ${env.symbol} a month${rec.previous ? `, up from ${formatAmount(rec.previous)}` : ""}. I'll track it.`;
  } else {
    recs.push({ type: "USUAL", name: a.name, amount: formatAmount(rec.usual), count: rec.count });
    if (category) recs.push({ type: "CATEGORY", address: q.address, category });
    say = `Got it, ${a.name}. Usually ${formatAmount(rec.usual)} ${env.symbol}.`;
  }
  recs.push({ type: "MENTION", name: a.name, at: Date.now() });
  const n = await write(recs);
  const undo = recs.filter((r) => r.type === "CONTACT" || r.type === "USUAL" || r.type === "SUBSCRIPTION").map((r) => ({ ...r, removed: true }) as Rec);
  const skip = [...(ctx.skip ?? []), q.address];
  const nowKnown: State = { ...s, contacts: { ...s.contacts, [a.name.toLowerCase()]: recs[0] as never } };
  const next = questionsFrom(hist, nowKnown, skip)[0] ?? null;
  if (next) return { say: `${say} ${next.text}`, asking: next, undo, remembered: n };
  // Everyone is named: propose the first limit from what the history shows.
  const after = reduce([...stateRecords(s), ...recs.map((r) => ({ ...r, v: Date.now() }))]);
  const sug = suggestLimit(after, hist);
  if (!sug) return { say, asking: null, undo, remembered: n };
  return { say: `${say} I'd like a credit line: ${sug.amount} ${env.symbol} a ${sug.periodDays === 30 ? "month" : sug.periodDays === 7 ? "week" : "day"} for ${sug.category}. OK?`, asking: null, undo, followUp: { kind: "set_limit", category: sug.category, amount: sug.amount, periodDays: sug.periodDays }, remembered: n };
}

/** State back to records, to fold new facts in before they are indexed. */
const stateRecords = (s: State): Stamped[] =>
  [...Object.values(s.contacts), ...Object.values(s.subscriptions), ...Object.values(s.limits), ...s.payments, ...Object.entries(s.categories).map(([address, category]) => ({ type: "CATEGORY" as const, address, category }))]
    .map((r) => ({ v: 0, ...r }) as Stamped);

function subscription(name: string, r: Recurring): Extract<Rec, { type: "SUBSCRIPTION" }> {
  return {
    type: "SUBSCRIPTION", name, address: r.address, amount: formatAmount(r.last),
    previousAmount: r.previous ? formatAmount(r.previous) : undefined,
    // shortcut: seeded testnet history is minutes apart, so sub-day cadence is assumed monthly.
    cadenceDays: r.cadenceDays >= 1 ? r.cadenceDays : 30,
    lastAt: r.lastAt,
  };
}

async function pay(a: Extract<Action, { kind: "pay" }>, s: State): Promise<Out> {
  const hist = await wallet.history();
  const v = validateIntent(s, { to: a.to, amount: a.amount }, Date.now(), hist);
  if (!v.ok) return { say: v.ask, followUp: v.retry ? { kind: "pay", to: v.retry.to, amount: v.retry.amount == null ? undefined : String(v.retry.amount) } : null, remembered: 0 };
  const { plan } = v;
  const short = plan.amount - (await wallet.balance());
  if (short > 0n) return { say: `That's ${formatAmount(short)} ${env.symbol} more than you have.`, remembered: 0 };
  // Something the user told Usual about this person outranks every limit.
  const warned = (await load()).records.find((r) => r.type === "CORRECTION" && new RegExp(`\\b${plan.contact.name}\\b`, "i").test(r.note));
  const said = warned?.type === "CORRECTION" ? warned.note : null;
  const lost = suspended(s, plan.category);
  const allowanceId = plan.limit.ok && !plan.guard && !said && !lost ? plan.limit.allowanceId : undefined;
  let p = await wallet.preview(plan.contact.address, plan.amount, allowanceId);
  // The chain is the real enforcer. If it refuses the agent, the owner can still pay.
  const refused = !p.ok && p.path === "agent";
  if (refused) p = await wallet.preview(plan.contact.address, plan.amount);
  const overLimit = refused ? "over what the agent can spend" : plan.limit.ok ? plan.guard?.toLowerCase() : `over your ${plan.category} limit (${formatAmount(plan.limit.remaining)} left)`;
  const n = await write([{ type: "MENTION", name: plan.contact.name, at: Date.now() }]);
  const understood = `${plan.amountText} ${env.symbol} to ${plan.contact.name}${plan.reason ? `, ${plan.reason}` : ""} · balance after: ${formatBalance(p.balanceAfter)}`;
  return {
    say: said ? `You told me: “${said}” So this one needs your signature.` : lost ? `I lost my ${plan.category} line, so this one needs your signature.` : overLimit ? `${plan.guard && plan.limit.ok && !refused ? plan.guard : `That's ${overLimit}`}, so it needs your signature.` : p.path === "owner" ? "Sign to send it." : `Sending ${plan.contact.name} ${plan.amountText}.`,
    understood,
    proposal: { type: "pay", to: plan.contact.name, name: plan.contact.name, address: plan.contact.address, amount: plan.amountText, category: plan.category, path: p.path, balanceAfter: formatBalance(p.balanceAfter), simulated: p.simulated, reason: plan.reason, overLimit },
    remembered: n,
  };
}

async function cafeProposal(item: string, s: State): Promise<Out> {
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  const q = await wallet.cafeQuote(item, origin);
  const lim = checkLimit(s, "food", q.amount);
  const bal = await wallet.balance();
  if (q.amount > bal) return { say: `That's ${formatAmount(q.amount - bal)} ${env.symbol} more than you have.`, remembered: 0 };
  const check = lim.ok && lim.allowanceId ? await wallet.preview(q.recipient, q.amount, lim.allowanceId) : null;
  const overLimit = !lim.ok ? `over your food limit (${formatAmount(lim.remaining)} left today)` : check && !check.ok ? "over what the agent can spend" : undefined;
  const path: wallet.Path = check?.ok ? "agent" : "owner";
  return {
    say: overLimit ? `${q.label} is ${formatAmount(q.amount)}. That's ${overLimit}, so I can't pay it on my own. Sign to approve this one.` : `Paying the café ${formatAmount(q.amount)} for a ${q.label.toLowerCase()}.`,
    understood: `${q.label} · ${formatAmount(q.amount)} ${env.symbol} to the café · balance after: ${formatBalance(bal - q.amount)}`,
    proposal: { type: "cafe", item, label: q.label, amount: formatAmount(q.amount), path, overLimit, balanceAfter: formatBalance(bal - q.amount) },
    remembered: 0,
  };
}

async function summary(s: State): Promise<Out> {
  const hist = await wallet.history();
  const since = Date.now() - 30 * DAY;
  const byCat = new Map<Category, bigint>();
  for (const p of hist.filter((p) => p.at >= since)) {
    const c = p.to === wallet.cafeAddress() ? "food" : categoryFor(s, p.to);
    byCat.set(c, (byCat.get(c) ?? 0n) + p.amount);
  }
  const parts = [...byCat].sort((a, b) => Number(b[1] - a[1])).map(([c, v]) => `${formatAmount(v)} on ${c}`);
  const notes: string[] = [];
  let followUp: Action | null = null;
  for (const sub of Object.values(s.subscriptions).filter((x) => !x.cancelled)) {
    if (sub.previousAmount) notes.push(`your ${sub.name.toLowerCase()} went from ${sub.previousAmount} to ${sub.amount}`);
  }
  // A subscription the user never brings up after naming it is the likeliest waste.
  const named = (n: string) => s.mentions[n.toLowerCase()] ?? 0;
  const stale = Object.values(s.subscriptions)
    .filter((x) => !x.cancelled && !x.previousAmount)
    .sort((a, b) => named(a.name) - named(b.name))[0];
  if (stale) {
    notes.push(`you haven't mentioned ${stale.name} since ${fmtDate(named(stale.name) || stale.lastAt)}`);
    followUp = { kind: "cancel", name: stale.name };
  }
  const say = [
    parts.length ? `Last 30 days: ${parts.join(", ")}.` : "No spending in the last 30 days.",
    notes.length ? `${notes.join(", and ").replace(/^./, (c) => c.toUpperCase())}.` : "",
    followUp ? `Cancel ${stale!.name}?` : "",
  ].filter(Boolean).join(" ");
  const rows = [...byCat].sort((a, b) => Number(b[1] - a[1])).map(([c, v]) => ({ label: c.replace(/^./, (x) => x.toUpperCase()), value: formatAmount(v) }));
  const note = notes.length ? `${notes.join(", and ").replace(/^./, (c) => c.toUpperCase())}.` : undefined;
  return { say, followUp, insight: { rows, note }, remembered: 0 };
}

/** Learning loop: three payments in a row at a new amount become the new usual. */
export function learnedUsual(s: State, name: string, address: string): string | null {
  const recent = s.payments.filter((p) => p.to === address).slice(0, 3).map((p) => p.amount);
  const cur = s.usuals[name.toLowerCase()]?.amount;
  return recent.length === 3 && recent.every((a) => a === recent[0]) && recent[0] !== cur ? recent[0] : null;
}

/** Confirmed agent payment: re-validate, pay inside the allowance, remember it. */
export async function confirmPay(to: string, amount?: string) {
  const { state: s } = await load();
  const v = validateIntent(s, { to, amount }, Date.now(), await wallet.history());
  if (!v.ok) return { ok: false as const, say: v.ask };
  const { plan } = v;
  if (!plan.limit.ok || !plan.limit.allowanceId || plan.guard) {
    return { ok: false as const, say: "This needs your signature.", needsOwner: await wallet.ownerPayBytes(plan.contact.address, plan.amount) };
  }
  if (wallet.onDevice()) return { ok: true as const, agentBytes: await wallet.agentPayBytes(plan.contact.address, plan.amount, plan.limit.allowanceId) };
  const r = await wallet.agentPay(plan.contact.address, plan.amount, plan.limit.allowanceId);
  return { ok: true as const, ...(await recordPayment(s, plan.contact.address, plan.amount, r.digest, "agent")) };
}

/** Owner-signed payment bytes for a plan the server validated. */
export async function ownerPay(to: string, amount?: string) {
  const { state: s } = await load();
  const v = validateIntent(s, { to, amount }, Date.now(), await wallet.history());
  if (!v.ok) return { ok: false as const, say: v.ask };
  return { ok: true as const, bytes: await wallet.ownerPayBytes(v.plan.contact.address, v.plan.amount) };
}

export async function recordPayment(s: State, address: string, amount: bigint, digest: string, via: "agent" | "owner" | "mpp") {
  const name = nameForAddress(s, address);
  const category = categoryFor(s, address);
  const recs: Rec[] = [{ type: "PAYMENT", to: address, name, amount: formatAmount(amount), digest, category, at: Date.now(), via }, { type: "VERDICT", category, outcome: "clean", name, digest, at: Date.now() }];
  const after = { ...s, payments: [recs[0] as Extract<Rec, { type: "PAYMENT" }>, ...s.payments], verdicts: [...s.verdicts, recs[1] as Extract<Rec, { type: "VERDICT" }>] };
  const learned = name ? learnedUsual(after, name, address) : null;
  if (name && learned) recs.push({ type: "USUAL", name, amount: learned, count: 3 });
  else if (name && s.usuals[name.toLowerCase()]?.amount === formatAmount(amount)) {
    const u = s.usuals[name.toLowerCase()];
    recs.push({ ...u, count: (u.count ?? 0) + 1 });
  }
  await remember(recs);
  const sug = suggestLimit({ ...after }, []);
  return {
    digest,
    followUp: sug?.raise ? ({ kind: "set_limit", category: sug.category, amount: sug.amount, periodDays: sug.periodDays } as Action) : undefined,
    say: `Sent ${formatAmount(amount)} ${env.symbol}${name ? ` to ${name}` : ""}.${learned ? ` I'll treat ${learned} as ${name}'s usual from now on.` : ""}${sug?.raise ? ` My ${sug.category} record is clean. Can I have ${sug.amount}?` : ""}`,
  };
}

/** Owner signed something: a payment, a new limit, or a one-shot café approval. */
export async function afterSigned(kind: "pay" | "agent-pay" | "limit" | "cafe" | "seed" | "deposit", bytes: string, signature: string, meta: { category?: Category; amount?: string; periodDays?: number; item?: string }) {
  const { state: s } = await load();
  const before = kind === "deposit" ? await wallet.looseBalance() : 0n;
  const r = await wallet.submitSigned(bytes, signature);
  if (kind === "pay" || kind === "agent-pay") {
    if (!r.payment) return { ok: true, digest: r.digest, say: "Done." };
    return { ok: true, ...(await recordPayment(s, r.payment.to, r.payment.amount, r.digest, kind === "pay" ? "owner" : "agent")) };
  }
  if (kind === "seed") return { ok: true, digest: r.digest, say: "" };
  if (kind === "deposit") {
    await remember([{ type: "DEPOSIT", amount: formatAmount(before), digest: r.digest, at: Date.now() }]);
    return { ok: true, digest: r.digest, say: `${formatAmount(before)} ${env.symbol} is ready to spend.` };
  }
  const allowanceId = r.allowances[0];
  if (!allowanceId) return { ok: false, digest: r.digest, say: "Signed, but no allowance was created." };
  if (kind === "limit") {
    const amount = parseAmount(meta.amount ?? "");
    if (!meta.category || amount == null || !meta.periodDays) return { ok: false, digest: r.digest, say: "Missing limit details." };
    await remember([{ type: "LIMIT", category: meta.category, amount: formatAmount(amount), periodDays: meta.periodDays, allowanceId, capId: r.caps[0] }]);
    return { ok: true, digest: r.digest, allowanceId, say: `Approved. I can spend up to ${formatAmount(amount)} ${env.symbol} a ${meta.periodDays === 1 ? "day" : meta.periodDays === 7 ? "week" : meta.periodDays === 30 ? "month" : `${meta.periodDays} days`} on ${meta.category}. Above that, I'll ask you.` };
  }
  return payCafe(meta.item ?? "flat-white", allowanceId, s);
}

/** Pay the café over MPP from an allowance (the food allowance, or a one-shot owner approval). */
export async function payCafe(item: string, allowanceId: string | undefined, s?: State) {
  const state = s ?? (await load()).state;
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  const q = await wallet.cafeQuote(item, origin);
  let id = allowanceId;
  if (!id) {
    const lim = checkLimit(state, "food", q.amount);
    if (!lim.ok || !lim.allowanceId) return { ok: false, say: "Over the food limit: needs your signature.", needsOwner: await wallet.oneShotBytes(q.label, q.amount) };
    id = lim.allowanceId;
  }
  if (wallet.onDevice()) return { ok: true, agentCafe: await wallet.cafePrepare(item, origin, id, q.amount) };
  const r = await wallet.cafePay(item, origin, id, q.amount);
  return recordCafe(q, r, allowanceId ? "owner" : "mpp");
}

/** The device signed: settle the café payment and remember it. */
export async function finishCafe(item: string, challenge: string, bytes: string, signature: string, proofSignature: string) {
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  const q = await wallet.cafeQuote(item, origin);
  return recordCafe(q, await wallet.cafeSettle(item, origin, challenge, bytes, signature, proofSignature), "mpp");
}

async function recordCafe(q: Awaited<ReturnType<typeof wallet.cafeQuote>>, r: { digest: string; receipt?: string | null }, via: "owner" | "mpp") {
  await remember([
    { type: "CATEGORY", address: q.recipient, category: "food" },
    { type: "PAYMENT", to: q.recipient, name: "Café", amount: formatAmount(q.amount), digest: r.digest, category: "food", at: Date.now(), via },
    { type: "VERDICT", category: "food", outcome: "clean", name: "Café", digest: r.digest, at: Date.now() },
  ]);
  return { ok: true, digest: r.digest, receipt: r.receipt, say: `Paid the café ${formatAmount(q.amount)}. Enjoy your ${q.label.toLowerCase()}.` };
}
