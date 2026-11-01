// User knowledge lives only in the owner's Walrus Memory account. Usual holds a revocable
// delegate key. State is rebuilt from Walrus on load; the in-process copy is a short cache.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemWal, MemWalRateLimitedError } from "@mysten-incubation/memwal";
import { operatorAddress } from "./chain";
import { env, MOCK } from "./env";
import { delegateKey, memoryAccount } from "./memoryAccount";
import { decode, encode, keyOf, reduce, sentence, type Rec, type Stamped, type State } from "./records";
import { currentUser } from "./user";

export type Loaded = { state: State; records: Stamped[]; source: "walrus" | "cache" | "mock"; error?: string; pending: number };

// One query per record type: recall is semantic, so a type-specific query reaches every record of that type.
const QUERIES = [
  "Contact: person is the user's relative or friend, wallet address",
  "Usual payment: the user usually sends this person USDC",
  "Spending limit: category capped at USDC every days",
  "Subscription: charges USDC every days",
  "Payment: sent USDC to someone for category, tx",
  "Correction from the user",
  "Preference: setting is value",
  "Spending category: payments count as category",
  "Mention: the user talked about",
  "Deposit: the user added USDC to their balance",
];

type Job = { id: string; record: Stamped };
type Store = {
  records: Stamped[]; at: number; pending: Stamped[]; inflight: Job[]; jobs: string[]; mock: Stamped[]; memoryOn: boolean;
  client?: MemWal; account: string | null; accountAt: number; claiming: boolean; queueLoaded: boolean; rebuilding: Promise<Loaded> | null; flushing: Promise<void> | null; retryAt: number; settledAt: number;
};

// A wallet that hasn't claimed its own account yet gets a namespace on the demo account.
const namespace = () => {
  const user = currentUser();
  return !user || user === operatorAddress() ? env.memwalNamespace : `usual-${user.slice(2, 18)}`;
};
const memwal = () => {
  const s = store();
  return (s.client ??= MemWal.create({ key: env.memwalKey, accountId: env.memwalAccount, serverUrl: env.memwalUrl, namespace: namespace() }));
};

const g = globalThis as unknown as { __usual?: Map<string, Store> };
// Mock mode starts where `pnpm setup:allowances` leaves a real account: three category limits.
const mockLimits = (): Stamped[] => ([["family", "100", 7], ["food", "3", 1]] as const)
  .map(([category, amount, periodDays], i) => ({ type: "LIMIT", category, amount, periodDays, allowanceId: `0xMOCKALLOW${i}`, capId: `0xMOCKCAP${i}`, v: i + 1 }));
const ACCOUNT_CHECK_MS = 60_000;

/** Follow what the chain says about this wallet's account: owned, not yet claimed, or revoked. */
async function followAccount() {
  const user = currentUser();
  const mem = store();
  if (MOCK || !user || user === operatorAddress() || Date.now() - mem.accountAt < ACCOUNT_CHECK_MS) return;
  const a = await memoryAccount(user).catch((e) => { console.warn("[memory] couldn't read the account:", (e as Error).message); return null; });
  if (!a) return;
  mem.accountAt = Date.now();
  if (a.authorized) mem.claiming = false;
  if (a.authorized && a.accountId !== mem.account) {
    mem.client = MemWal.create({ key: delegateKey(user), accountId: a.accountId!, serverUrl: env.memwalUrl, namespace: "usual" });
    mem.account = a.accountId;
    mem.memoryOn = true;
    // What Usual learned before the claim moves into the wallet's own account.
    mem.pending.push(...mem.records);
    mem.records = [];
    mem.at = 0;
    saveQueue();
  } else if (a.accountId && !a.authorized && !mem.claiming) {
    // Revoked: Usual stops knowing anything, and nothing falls back to the demo account.
    mem.client = undefined;
    mem.account = null;
    mem.memoryOn = false;
    mem.records = [];
    mem.pending = [];
    mem.at = 0;
  }
}

/** Mid-claim the account exists but Usual's key isn't on it yet. That isn't a revocation, so keep what's held. */
export const claimStarted = () => { store().claiming = true; };

/** The owner just changed their account on-chain; look again now. */
export async function accountChanged() {
  store().accountAt = 0;
  await followAccount();
}

/** This wallet's own account, once it has claimed one. */
export const ownedAccount = () => store().account;

function store(): Store {
  const stores = (g.__usual ??= new Map());
  const key = namespace();
  let s = stores.get(key);
  if (!s) stores.set(key, (s = { records: [], at: 0, pending: [], inflight: [], jobs: [], mock: mockLimits(), memoryOn: true, account: null, accountAt: 0, claiming: false, queueLoaded: false, rebuilding: null, flushing: null, retryAt: 0, settledAt: 0 }));
  return s;
}

/** Memory on/off toggle for the before/after demo. Off = the app behaves as if it remembers nothing. */
export const setMemoryOn = (on: boolean) => { store().memoryOn = on; };
export const memoryOn = () => store().memoryOn;

// Unconfirmed writes survive a restart: a payment's memory must not die with the process.
const queueFile = () => join(tmpdir(), `usual-queue-${namespace()}.json`);
function saveQueue() {
  const mem = store();
  try {
    writeFileSync(queueFile(), JSON.stringify([...mem.pending, ...mem.inflight.map((j) => j.record)]), { mode: 0o600 });
  } catch (e) {
    console.warn("[memory] couldn't persist the queue:", (e as Error).message);
  }
}
function loadQueue() {
  const mem = store();
  if (mem.queueLoaded || MOCK) return;
  mem.queueLoaded = true;
  try {
    if (existsSync(queueFile())) mem.pending.push(...(JSON.parse(readFileSync(queueFile(), "utf8")) as Stamped[]));
  } catch (e) {
    console.warn("[memory] couldn't read the queue:", (e as Error).message);
  }
}

const CACHE_MS = 60_000;

/** Rebuild state. `fresh` bypasses the cache and reads everything back from Walrus. */
export async function load(fresh = false): Promise<Loaded> {
  await followAccount();
  const mem = store();
  if (!mem.memoryOn) return { state: reduce([]), records: [], source: MOCK ? "mock" : "cache", pending: 0 };
  if (MOCK) return { state: reduce(mem.mock), records: mem.mock, source: "mock", pending: 0 };
  void flush();
  // A stale copy answers now and refreshes behind it: a reply never waits on nine recalls.
  if (!fresh && mem.at) {
    if (Date.now() - mem.at >= CACHE_MS) mem.rebuilding ??= rebuild().finally(() => { mem.rebuilding = null; });
    const records = [...mem.records, ...mem.pending];
    return { state: reduce(records), records, source: "cache", pending: unsaved() };
  }
  return (mem.rebuilding ??= rebuild().finally(() => { mem.rebuilding = null; }));
}

async function rebuild(): Promise<Loaded> {
  const mem = store();
  try {
    const seen = new Map<string, Stamped>();
    for (const res of await Promise.all(QUERIES.map((query) => memwal().recall({ query, limit: 100 })))) {
      for (const hit of res.results) {
        const r = decode(hit.text);
        if (r) seen.set(hit.blob_id, r);
      }
    }
    // Writes accepted but not yet indexed still count, so nothing the user just said is lost.
    const fromWalrus = [...seen.values()];
    const known = new Set(fromWalrus.map((r) => `${keyOf(r)}@${r.v}`));
    const unconfirmed = new Set(mem.inflight.map((j) => j.record));
    const recent = mem.records.filter((r) => (unconfirmed.has(r) || Date.now() - r.v < 10 * 60_000) && !known.has(`${keyOf(r)}@${r.v}`));
    mem.records = [...fromWalrus, ...recent];
    mem.at = Date.now();
    const records = [...mem.records, ...mem.pending];
    return { state: reduce(records), records, source: "walrus", pending: unsaved() };
  } catch (e) {
    // A revoked delegate lands here: Usual no longer knows anything.
    mem.records = [];
    mem.at = 0;
    return { state: reduce([]), records: [], source: "walrus", error: String((e as Error).message ?? e), pending: unsaved() };
  }
}

/** What memory says about this, by meaning: the plain sentences, nearest first. Never throws; a chat reply shouldn't die on it. */
export async function recallAbout(query: string, limit = 6): Promise<string[]> {
  await followAccount();
  const mem = store();
  if (!mem.memoryOn) return [];
  if (MOCK) {
    const words = query.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    return mem.mock.map(sentence).filter((t) => words.some((w) => t.toLowerCase().includes(w))).slice(0, limit);
  }
  try {
    const res = await memwal().recall({ query, limit });
    return res.results.map((hit) => hit.text.split(" || ")[0]);
  } catch (e) {
    console.warn("[memory] recall failed:", (e as Error).message);
    return [];
  }
}

/** Store facts. Returns at once; failed writes stay queued and retry on the next request. */
export async function remember(recs: Rec[]): Promise<{ stored: Stamped[]; queued: number }> {
  await followAccount();
  const mem = store();
  if (!mem.memoryOn) return { stored: [], queued: 0 };
  const now = Date.now();
  const stored = recs.map((r, i) => ({ ...r, v: now + i }) as Stamped);
  if (MOCK) {
    mem.mock.push(...stored);
    return { stored, queued: 0 };
  }
  mem.pending.push(...stored);
  saveQueue();
  // Persisted above, so the reply never waits on Walrus. Failures retry from the queue.
  void flush();
  return { stored, queued: mem.pending.length };
}

/** Jobs that came back failed. "Accepted" isn't "stored": a job can still fail upstream. */
export function failedJobs(inflight: Job[], statuses: { job_id: string; status: string }[]) {
  const by = new Map(statuses.map((s) => [s.job_id, s.status]));
  return {
    failed: inflight.filter((j) => by.get(j.id) === "failed"),
    waiting: inflight.filter((j) => !["done", "failed"].includes(by.get(j.id) ?? "pending")),
  };
}

/** Put writes that failed after acceptance back on the queue, so nothing is lost. */
async function settle() {
  const mem = store();
  if (!mem.inflight.length || Date.now() - mem.settledAt < 5_000) return;
  mem.settledAt = Date.now();
  try {
    const res = await memwal().getRememberBulkStatus(mem.inflight.map((j) => j.id).slice(0, 20));
    const { failed, waiting } = failedJobs(mem.inflight, res.results);
    mem.inflight = waiting;
    if (failed.length) {
      const back = new Set(failed.map((j) => j.record));
      mem.records = mem.records.filter((r) => !back.has(r));
      mem.pending.push(...back);
      console.warn(`[memory] ${failed.length} write(s) failed upstream, queued again`);
    }
  } catch (e) {
    console.warn("[memory] couldn't read job status:", (e as Error).message);
  }
}

/** Writes not yet confirmed on Walrus. */
export const unsaved = () => store().pending.length + store().inflight.length;

/** Send queued writes in batches of 20 (relayer limit: 60 req/min per key; 429 => wait retry_after). */
export function flush(): Promise<void> {
  const mem = store();
  loadQueue();
  if (mem.flushing) return mem.flushing;
  mem.flushing = (async () => {
    await settle();
    while (mem.pending.length && Date.now() >= mem.retryAt) {
      const batch = mem.pending.slice(0, 20);
      try {
        const res = await memwal().rememberBulk(batch.map((r) => ({ text: encode(r) })));
        mem.jobs.push(...res.job_ids);
        mem.inflight.push(...res.job_ids.map((id, i) => ({ id, record: batch[i] })));
        mem.pending.splice(0, batch.length);
        mem.records.push(...batch);
      } catch (e) {
        const wait = e instanceof MemWalRateLimitedError ? (e.retryAfterSeconds ?? 10) : 15;
        mem.retryAt = Date.now() + wait * 1000;
        console.warn(`[memory] write failed, ${mem.pending.length} queued, retry in ${wait}s:`, (e as Error).message);
        break;
      }
    }
  })().finally(() => { mem.flushing = null; saveQueue(); });
  return mem.flushing;
}

export const jobIds = () => [...store().jobs];

/** Proof for the README: how many memories exist in the account, with blob IDs. */
export async function proof() {
  if (MOCK) return { count: store().mock.length, blobs: [] as string[], mock: true };
  let cursor: string | undefined;
  const blobs: string[] = [];
  do {
    const page = await memwal().listMemories({ cursor, limit: 500, namespace: namespace() });
    blobs.push(...page.memories.map((m) => m.blob_id));
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return { count: blobs.length, blobs, mock: false };
}

export const health = () => (MOCK ? Promise.resolve({ status: "mock" }) : memwal().health());

/** Restore the relayer index from Walrus blobs (used on a fresh setup). */
export const restore = (limit = 50) => (MOCK ? Promise.resolve(null) : memwal().restore(namespace(), limit));
