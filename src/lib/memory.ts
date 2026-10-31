// User knowledge lives only in the owner's Walrus Memory account. Usual holds a revocable
// delegate key. State is rebuilt from Walrus on load; the in-process copy is a short cache.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

type Job = { id: string; record: Stamped };
const g = globalThis as unknown as { __usual?: { records: Stamped[]; at: number; pending: Stamped[]; inflight: Job[]; jobs: string[]; mock: Stamped[]; memoryOn: boolean } };
// Mock mode starts where `pnpm setup:allowances` leaves a real account: three category limits.
const mockLimits = (): Stamped[] => ([["family", "100", 7], ["food", "3", 1]] as const)
  .map(([category, amount, periodDays], i) => ({ type: "LIMIT", category, amount, periodDays, allowanceId: `0xMOCKALLOW${i}`, capId: `0xMOCKCAP${i}`, v: i + 1 }));
const mem = (g.__usual ??= { records: [], at: 0, pending: [], inflight: [], jobs: [], mock: mockLimits(), memoryOn: true });

/** Memory on/off toggle for the before/after demo. Off = the app behaves as if it remembers nothing. */
export const setMemoryOn = (on: boolean) => { mem.memoryOn = on; };
export const memoryOn = () => mem.memoryOn;

// Unconfirmed writes survive a restart: a payment's memory must not die with the process.
const queueFile = () => join(tmpdir(), `usual-queue-${env.memwalNamespace}.json`);
function saveQueue() {
  try {
    writeFileSync(queueFile(), JSON.stringify([...mem.pending, ...mem.inflight.map((j) => j.record)]), { mode: 0o600 });
  } catch (e) {
    console.warn("[memory] couldn't persist the queue:", (e as Error).message);
  }
}
let queueLoaded = false;
function loadQueue() {
  if (queueLoaded || MOCK) return;
  queueLoaded = true;
  try {
    if (existsSync(queueFile())) mem.pending.push(...(JSON.parse(readFileSync(queueFile(), "utf8")) as Stamped[]));
  } catch (e) {
    console.warn("[memory] couldn't read the queue:", (e as Error).message);
  }
}

const CACHE_MS = 60_000;

/** Rebuild state. `fresh` bypasses the cache and reads everything back from Walrus. */
export async function load(fresh = false): Promise<Loaded> {
  if (!mem.memoryOn) return { state: reduce([]), records: [], source: MOCK ? "mock" : "cache", pending: 0 };
  if (MOCK) return { state: reduce(mem.mock), records: mem.mock, source: "mock", pending: 0 };
  void flush();
  if (!fresh && Date.now() - mem.at < CACHE_MS) {
    const records = [...mem.records, ...mem.pending];
    return { state: reduce(records), records, source: "cache", pending: unsaved() };
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
  saveQueue();
  await flush();
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

let settledAt = 0;
/** Put writes that failed after acceptance back on the queue, so nothing is lost. */
async function settle() {
  if (!mem.inflight.length || Date.now() - settledAt < 5_000) return;
  settledAt = Date.now();
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
export const unsaved = () => mem.pending.length + mem.inflight.length;

let flushing: Promise<void> | null = null;
let retryAt = 0;
/** Send queued writes in batches of 20 (relayer limit: 60 req/min per key; 429 => wait retry_after). */
export function flush(): Promise<void> {
  loadQueue();
  if (flushing) return flushing;
  flushing = (async () => {
    await settle();
    while (mem.pending.length && Date.now() >= retryAt) {
      const batch = mem.pending.slice(0, 20);
      try {
        const res = await memwal().rememberBulk(batch.map((r) => ({ text: encode(r) })));
        mem.jobs.push(...res.job_ids);
        mem.inflight.push(...res.job_ids.map((id, i) => ({ id, record: batch[i] })));
        mem.pending.splice(0, batch.length);
        mem.records.push(...batch);
      } catch (e) {
        const wait = e instanceof MemWalRateLimitedError ? (e.retryAfterSeconds ?? 10) : 15;
        retryAt = Date.now() + wait * 1000;
        console.warn(`[memory] write failed, ${mem.pending.length} queued, retry in ${wait}s:`, (e as Error).message);
        break;
      }
    }
  })().finally(() => { flushing = null; saveQueue(); });
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
