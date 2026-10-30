// All chain reads, simulations and executions go through Tatum's Sui gRPC gateway.
// Tatum serves native gRPC (not gRPC-Web), so this module is server-only.
import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { UnaryCall, type MethodInfo, type RpcOptions } from "@protobuf-ts/runtime-rpc";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { env } from "./env";
import type { ChainPayment } from "./insights";

// Tatum's free plan allows ~3 req/s and building one transaction fires several calls, so every unary
// call takes a turn (≤2.5/s) and a 429 retries with backoff instead of failing the payment.
let nextSlot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function turn() {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 400;
  if (wait) await sleep(wait);
}
class PacedTransport extends GrpcTransport {
  override unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): UnaryCall<I, O> {
    const run = async (attempt: number): Promise<UnaryCall<I, O>> => {
      await turn();
      const call = super.unary(method, input, options);
      try {
        await call;
        return call;
      } catch (e) {
        if (attempt < 5 && /429|UNAVAILABLE/.test(String((e as Error).message) + String((e as { code?: string }).code))) {
          await sleep(800 * 2 ** attempt);
          return run(attempt + 1);
        }
        throw e;
      }
    };
    const done = run(0);
    return new UnaryCall(method, options.meta ?? {}, input, done.then((c) => c.headers), done.then((c) => c.response), done.then((c) => c.status), done.then((c) => c.trailers));
  }
}

let cached: SuiGrpcClient | undefined;
export function sui(): SuiGrpcClient {
  return (cached ??= new SuiGrpcClient({
    network: env.network,
    transport: new PacedTransport({
      host: ((h) => (/:\d+$/.test(h) ? h : `${h}:443`))(env.tatumGrpc.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      channelCredentials: ChannelCredentials.createSsl(),
      meta: { "x-api-key": env.tatumKey },
    }),
  }));
}

export const agent = () => Ed25519Keypair.fromSecretKey(env.agentKey);

// Serialize chain work and cache reads briefly (the transport does the rate limiting).
let chainQueue = Promise.resolve();
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
export function paced<T>(key: string | null, fn: () => Promise<T>, ttlMs = 5_000): Promise<T> {
  const hit = key ? memo.get(key) : undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const run = chainQueue.then(fn);
  chainQueue = run.then(() => undefined, () => undefined);
  if (key) {
    memo.set(key, { at: Date.now(), value: run });
    run.catch(() => memo.delete(key));
  }
  return run;
}

/** Total USDC (coins + address balance) in base units. */
export async function usdcBalance(address: string): Promise<bigint> {
  const r = await paced(`bal:${address}`, () => sui().core.getBalance({ owner: address, coinType: env.usdc }));
  return BigInt(r.balance.balance);
}

// Tatum indexes history only from a recent checkpoint; asking from genesis is OUT_OF_RANGE. The SDK's
// listTransactions can't set a start, so this calls LedgerService.ListTransactions directly.
let earliest: bigint | undefined;

/** Outgoing USDC payments sent by `address`, newest first, read through Tatum. */
export function outgoingPayments(address: string, limit = 200): Promise<ChainPayment[]> {
  return paced(`hist:${address}`, async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const call = sui().ledgerService.listTransactions({
          readMask: { paths: ["digest", "balance_changes", "timestamp"] },
          startCheckpoint: earliest,
          filter: { terms: [{ literals: [{ negated: false, predicate: { oneofKind: "sender", sender: { address } } }] }] },
          options: { limit, ordering: 1 /* DESCENDING */ },
        });
        const out: ChainPayment[] = [];
        for await (const frame of call.responses) {
          const tx = frame.transaction;
          if (!tx) continue;
          const at = tx.timestamp ? Number(tx.timestamp.seconds) * 1000 + Math.floor(tx.timestamp.nanos / 1e6) : Date.now();
          for (const c of tx.balanceChanges) {
            if (c.coinType === env.usdc && c.address !== address && BigInt(c.amount ?? "0") > 0n) {
              out.push({ to: c.address!, amount: BigInt(c.amount!), digest: tx.digest!, at });
            }
          }
        }
        return out;
      } catch (e) {
        const low = String((e as Error).message).match(/lowest available checkpoint is (\d+)/);
        if (!low || attempt > 1) throw e;
        earliest = BigInt(low[1]) + 1n;
      }
    }
  }, 30_000);
}

/** Transfer USDC. With `allowance`, the agent spends from the owner's address balance under that allowance. */
export function transferTx(opts: { sender: string; to: string; amount: bigint; allowance?: { objectId: string; funder: string } }) {
  const tx = new Transaction();
  tx.setSender(opts.sender);
  const coin = tx.coin({ balance: opts.amount, type: env.usdc, ...(opts.allowance ? { allowance: opts.allowance } : {}) });
  tx.transferObjects([coin], opts.to);
  return tx;
}

/** Dry-run through Tatum: success flag, error, and the owner's USDC change. */
export async function simulate(tx: Transaction, owner: string) {
  const r = await paced(null, () => sui().core.simulateTransaction({ transaction: tx, include: { balanceChanges: true, effects: true } }));
  const t = r.Transaction ?? r.FailedTransaction!;
  const delta = (t.balanceChanges ?? []).filter((c) => c.address === owner && c.coinType === env.usdc).reduce((s, c) => s + BigInt(c.amount), 0n);
  return { ok: r.$kind === "Transaction" && t.status.success, error: t.status.success ? null : String(t.status.error?.message ?? "simulation failed"), delta };
}

/** Execute signed bytes (or sign with the agent) and confirm the result landed by reading it back through Tatum. */
export async function executeAndConfirm(args: { tx: Transaction; signer: Ed25519Keypair } | { bytes: Uint8Array; signature: string }) {
  const client = sui();
  const r = "signer" in args
    ? await paced(null, () => client.core.signAndExecuteTransaction({ transaction: args.tx, signer: args.signer, include: { effects: true } }))
    : await paced(null, () => client.core.executeTransaction({ transaction: args.bytes, signatures: [args.signature], include: { effects: true } }));
  const t = r.Transaction ?? r.FailedTransaction!;
  if (!t.status.success) throw new Error(String(t.status.error?.message ?? "transaction failed"));
  const confirmed = await paced(null, () => client.core.waitForTransaction({ digest: t.digest, include: { balanceChanges: true } }));
  const changes = confirmed.Transaction?.balanceChanges ?? [];
  return { digest: t.digest, confirmed: !!confirmed.Transaction?.status.success, effects: t.effects, changes };
}

/** The one wallet allowed to drive this deployment. */
export const ownerAddress = () => env.owner || (env.ownerKey ? Ed25519Keypair.fromSecretKey(env.ownerKey).toSuiAddress() : "");

/** Serialize a transaction for the owner's wallet to sign. */
export async function buildForOwner(tx: Transaction): Promise<string> {
  const bytes = await paced(null, () => tx.build({ client: sui() }));
  return Buffer.from(bytes).toString("base64");
}

/** USDC coin objects (not address balance) owned by `address`. */
export async function usdcCoins(address: string): Promise<string[]> {
  const r = await paced(null, () => sui().core.listCoins({ owner: address, coinType: env.usdc }));
  return r.objects.map((c) => c.objectId);
}
