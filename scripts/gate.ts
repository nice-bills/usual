// Day-1 gate: Tatum gRPC read, Walrus Memory write+recall on Mainnet, one testnet USDC send.
import { MemWal } from "@mysten-incubation/memwal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { executeAndConfirm, ownerAddress, sui, transferTx, usdcBalance } from "../src/lib/chain";
import { env } from "../src/lib/env";
import { formatAmount } from "../src/lib/money";

const step = async (name: string, fn: () => Promise<string>) => {
  try { console.log(`✓ ${name}: ${await fn()}`); return true; }
  catch (e) { console.log(`✗ ${name}: ${(e as Error).message}`); return false; }
};

const owner = ownerAddress();
await step("Tatum gRPC: protocol version", async () => {
  const pc = await sui().core.getProtocolConfig();
  const v = Number(pc.protocolConfig.protocolVersion);
  return `${v} (${v >= 137 ? "allowances supported" : "NO allowances: need v137+"})`;
});
await step("Tatum gRPC: owner USDC balance", async () => `${formatAmount(await usdcBalance(owner))} USDC at ${owner}`);
await step("Tatum gRPC: owner SUI balance", async () => `${Number((await sui().core.getBalance({ owner })).balance.balance) / 1e9} SUI`);

const memwal = () => MemWal.create({ key: env.memwalKey, accountId: env.memwalAccount, serverUrl: env.memwalUrl, namespace: env.memwalNamespace });
await step("Walrus Memory: health", async () => JSON.stringify(await memwal().health()).slice(0, 120));
await step("Walrus Memory: remember + wait (Mainnet)", async () => {
  const job = await memwal().remember(`Gate check: Usual connected at ${new Date().toISOString()}.`);
  const r = await memwal().waitForRememberJob(job.job_id, { timeoutMs: 120_000 });
  return `blob ${r.blob_id}`;
});
await step("Walrus Memory: recall", async () => {
  const r = await memwal().recall({ query: "Usual gate check connected", limit: 3 });
  return r.results.map((x) => x.text.slice(0, 60)).join(" | ") || "no results yet (indexing lag)";
});

await step("Testnet USDC send (owner -> Mum, 0.01)", async () => {
  const signer = Ed25519Keypair.fromSecretKey(env.ownerKey);
  const mum = Ed25519Keypair.fromSecretKey(process.env.PAYEE_MUM_PRIVATE_KEY!).toSuiAddress();
  const r = await executeAndConfirm({ tx: transferTx({ sender: owner, to: mum, amount: 10_000n }), signer });
  return `${r.digest} confirmed via Tatum: ${r.confirmed}`;
});
