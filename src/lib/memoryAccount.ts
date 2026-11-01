// Each wallet owns its Walrus Memory account on Sui mainnet, even when its money is on testnet.
// Usual gets a delegate key the owner registers and can revoke. Walrus's relayer sponsors these
// calls, so the owner needs no mainnet SUI: the wallet only signs.
import { createHmac } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { delegateKeyToPublicKey, sponsorAuthorizationMessage } from "@mysten-incubation/memwal";
import { mainnet } from "./chain";
import { env } from "./env";

const CLOCK = "0x6";
export type Step = "create" | "add" | "remove";
export type MemoryAccount = { accountId: string | null; authorized: boolean };

/** Derived, so a redeploy can't lose it. It reads memory but can't spend, and the owner can revoke it. */
export const delegateKey = (owner: string) => createHmac("sha256", env.sessionSecret).update(`usual-memory:${owner}`).digest("hex");
const publicKey = (owner: string) => delegateKeyToPublicKey(delegateKey(owner));

async function relayer<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.memwalUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Walrus Memory ${path}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/** Read from Sui through the relayer, never its cache: this is what decides who can read. */
export async function memoryAccount(owner: string): Promise<MemoryAccount> {
  const r = await relayer<{ account_id: string | null; keys: { public_key: string }[] }>(`/api/accounts/${owner}/delegate-keys`);
  const mine = Buffer.from(await publicKey(owner)).toString("hex");
  return { accountId: r.account_id, authorized: r.keys.some((k) => k.public_key === mine) };
}

export const nextStep = (a: MemoryAccount): Step | null => (!a.accountId ? "create" : a.authorized ? null : "add");

/** The unsigned call, and the message the wallet signs so Walrus will sponsor exactly this call. */
export async function prepare(owner: string, step: Step, accountId: string | null) {
  const { packageId, registryId } = await relayer<{ packageId: string; registryId: string }>("/config");
  const tx = new Transaction();
  tx.setSender(owner);
  const target = (fn: string) => `${packageId}::account::${fn}` as const;
  const key = tx.pure.vector("u8", [...(await publicKey(owner))]);
  if (step === "create") tx.moveCall({ target: target("create_account"), arguments: [tx.object(registryId), tx.object(CLOCK)] });
  else if (step === "add") tx.moveCall({ target: target("add_delegate_key"), arguments: [tx.object(accountId!), tx.object(registryId), key, tx.pure.string("Usual"), tx.object(CLOCK)] });
  else tx.moveCall({ target: target("remove_delegate_key"), arguments: [tx.object(accountId!), tx.object(registryId), key] });
  const bytes = await tx.build({ client: mainnet(), onlyTransactionKind: true });
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  return { kind: Buffer.from(bytes).toString("base64"), timestamp, nonce, message: await sponsorAuthorizationMessage(owner, bytes, timestamp, nonce) };
}

export const sponsor = (sender: string, kind: string, authTimestamp: number, authNonce: string, authSignature: string) =>
  relayer<{ bytes: string; digest: string }>("/sponsor", { transactionBlockKindBytes: kind, sender, authTimestamp, authNonce, authSignature });

/** Land it, then wait until the chain shows the change, so the next step can't repeat this one. */
export async function execute(sender: string, digest: string, signature: string, before: MemoryAccount) {
  await relayer("/sponsor/execute", { digest, sender, signature });
  for (let i = 0; i < 10; i++) {
    const now = await memoryAccount(sender);
    if (now.accountId !== before.accountId || now.authorized !== before.authorized) return now;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return before;
}
