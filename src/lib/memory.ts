// User knowledge lives only in the owner's Walrus Memory account. Usual holds a revocable
// delegate key. State is rebuilt from Walrus on load; the in-process copy is a short cache.
import { MemWal, MemWalRateLimitedError } from "@mysten-incubation/memwal";
import { env, MOCK } from "./env";
import { decode, encode, keyOf, reduce, type Rec, type Stamped, type State } from "./records";

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
];

let client: MemWal | undefined;
const memwal = () =>
  (client ??= MemWal.create({ key: env.memwalKey, accountId: env.memwalAccount, serverUrl: env.memwalUrl, namespace: env.memwalNamespace }));

const g = globalThis as unknown as { __usual?: { records: Stamped[]; at: number; pending: Stamped[]; jobs: string[]; mock: Stamped[]; memoryOn: boolean } };
// Mock mode starts where `pnpm setup:allowances` leaves a real account: three category limits.
const mockLimits = (): Stamped[] => ([["family", "100", 7], ["food", "3", 1], ["subscriptions", "60", 30]] as const)
  .map(([category, amount, periodDays], i) => ({ type: "LIMIT", category, amount, periodDays, allowanceId: `0xMOCKALLOW${i}`, capId: `0xMOCKCAP${i}`, v: i + 1 }));
const mem = (g.__usual ??= { records: [], at: 0, pending: [], jobs: [], mock: mockLimits(), memoryOn: true });

/** Memory on/off toggle for the before/after demo. Off = the app behaves as if it remembers nothing. */
export const setMemoryOn = (on: boolean) => { mem.memoryOn = on; };
export const memoryOn = () => mem.memoryOn;

const CACHE_MS = 60_000;

/** Rebuild state. `fresh` bypasses the cache and reads everything back from Walrus. */
export async function load(fresh = false): Promise<Loaded> {
  if (!mem.memoryOn) return { state: reduce([]), records: [], source: MOCK ? "mock" : "cache", pending: 0 };
  if (MOCK) return { state: reduce(mem.mock), records: mem.mock, source: "mock", pending: 0 };
  void flush();
  if (!fresh && Date.now() - mem.at < CACHE_MS) {
    const records = [...mem.records, ...mem.pending];
    return { state: reduce(records), records, source: "cache", pending: mem.pending.length };
  }
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
    const recent = mem.records.filter((r) => Date.now() - r.v < 10 * 60_000 && !known.has(`${keyOf(r)}@${r.v}`));
    mem.records = [...fromWalrus, ...recent];
    mem.at = Date.now();
    const records = [...mem.records, ...mem.pending];
    return { state: reduce(records), records, source: "walrus", pending: mem.pending.length };
  } catch (e) {
    // A revoked delegate lands here: Usual no longer knows anything.
    mem.records = [];
    mem.at = 0;
    return { state: reduce([]), records: [], source: "walrus", error: String((e as Error).message ?? e), pending: mem.pending.length };
  }
}

/** Store facts. Returns at once; failed writes stay queued and retry on the next request. */
export async function remember(recs: Rec[]): Promise<{ stored: Stamped[]; queued: number }> {
  if (!mem.memoryOn) return { stored: [], queued: 0 };
  const now = Date.now();
  const stored = recs.map((r, i) => ({ ...r, v: now + i }) as Stamped);
  if (MOCK) {
    mem.mock.push(...stored);
    return { stored, queued: 0 };
  }
  mem.pending.push(...stored);
  await flush();
  return { stored, queued: mem.pending.length };
}

let flushing: Promise<void> | null = null;
let retryAt = 0;
/** Send queued writes in batches of 20 (relayer limit: 60 req/min per key; 429 => wait retry_after). */
export function flush(): Promise<void> {
  if (flushing || !mem.pending.length || Date.now() < retryAt) return flushing ?? Promise.resolve();
  flushing = (async () => {
    while (mem.pending.length) {
      const batch = mem.pending.slice(0, 20);
      try {
        const res = await memwal().rememberBulk(batch.map((r) => ({ text: encode(r) })));
        mem.jobs.push(...res.job_ids);
        mem.pending.splice(0, batch.length);
        mem.records.push(...batch);
      } catch (e) {
        const wait = e instanceof MemWalRateLimitedError ? (e.retryAfterSeconds ?? 10) : 15;
        retryAt = Date.now() + wait * 1000;
        console.warn(`[memory] write failed, ${mem.pending.length} queued, retry in ${wait}s:`, (e as Error).message);
        break;
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export const jobIds = () => [...mem.jobs];

/** Proof for the README: how many memories exist in the account, with blob IDs. */
export async function proof() {
  if (MOCK) return { count: mem.mock.length, blobs: [] as string[], mock: true };
  let cursor: string | undefined;
  const blobs: string[] = [];
  do {
    const page = await memwal().listMemories({ cursor, limit: 500, namespace: env.memwalNamespace });
    blobs.push(...page.memories.map((m) => m.blob_id));
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return { count: blobs.length, blobs, mock: false };
}

export const health = () => (MOCK ? Promise.resolve({ status: "mock" }) : memwal().health());

/** Restore the relayer index from Walrus blobs (used on a fresh setup). */
export const restore = (limit = 50) => (MOCK ? Promise.resolve(null) : memwal().restore(env.memwalNamespace, limit));
