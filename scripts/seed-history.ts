// Seeds real recurring testnet history from the demo owner: Mum, gym (with a price rise), streaming, café.
// Usage: pnpm seed [round]   (rounds are idempotent per run; run it more than once for more history)
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { agent, executeAndConfirm, ownerAddress, sui, transferTx } from "../src/lib/chain";
import { env } from "../src/lib/env";

const owner = Ed25519Keypair.fromSecretKey(env.ownerKey);
const addr = (k: string) => Ed25519Keypair.fromSecretKey(process.env[k]!).toSuiAddress();
const usdc = (n: number) => BigInt(Math.round(n * 1e6));

// The agent key pays gas for allowance and MPP payments; top it up from the owner if it has none.
const agentSui = BigInt((await sui().core.getBalance({ owner: agent().toSuiAddress() })).balance.balance);
if (agentSui < 100_000_000n) {
  const tx = new Transaction();
  tx.setSender(ownerAddress());
  tx.transferObjects([tx.splitCoins(tx.gas, [300_000_000n])], agent().toSuiAddress());
  console.log(`agent gas 0.3 SUI  ${(await executeAndConfirm({ tx, signer: owner })).digest}`);
}

const plan: [string, string, number][] = [
  ["Mum", addr("PAYEE_MUM_PRIVATE_KEY"), 50], ["Mum", addr("PAYEE_MUM_PRIVATE_KEY"), 50], ["Mum", addr("PAYEE_MUM_PRIVATE_KEY"), 50],
  ["gym", addr("PAYEE_GYM_PRIVATE_KEY"), 30], ["gym", addr("PAYEE_GYM_PRIVATE_KEY"), 30], ["gym", addr("PAYEE_GYM_PRIVATE_KEY"), 35],
  ["streaming", addr("PAYEE_STREAM_PRIVATE_KEY"), 12], ["streaming", addr("PAYEE_STREAM_PRIVATE_KEY"), 12],
  ["café", env.cafe, 4.5],
];
// DEMO_SCALE shrinks amounts to fit faucet-sized balances (0.05 sends Mum 2.50).
const scale = env.scale;
for (const [who, to, amt] of plan) {
  const r = await executeAndConfirm({ tx: transferTx({ sender: ownerAddress(), to, amount: usdc(amt * scale) }), signer: owner });
  console.log(`${who.padEnd(10)} ${(amt * scale).toFixed(2).padStart(7)} ${env.symbol}  ${r.digest}`);
}
