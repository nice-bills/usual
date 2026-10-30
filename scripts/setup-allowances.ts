// Moves the owner's USDC into its address balance and issues one native allowance per category
// with the agent as spender. Records each as a LIMIT memory on Walrus. Owner key: testnet demo only.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { addAllowance, createdAllowances, depositToAddressBalance } from "../src/lib/allowances";
import { agent, executeAndConfirm, ownerAddress, usdcCoins } from "../src/lib/chain";
import { env } from "../src/lib/env";
import { flush, remember } from "../src/lib/memory";
import type { Category } from "../src/lib/records";

const owner = Ed25519Keypair.fromSecretKey(env.ownerKey);
const me = ownerAddress();

const coins = await usdcCoins(me);
if (coins.length) {
  const tx = new Transaction();
  tx.setSender(me);
  depositToAddressBalance(tx, me, coins);
  console.log("deposit to address balance:", (await executeAndConfirm({ tx, signer: owner })).digest);
}

const limits: [Category, number, number][] = [["family", 100, 7], ["food", 3, 1], ["subscriptions", 60, 30]];
for (const [category, amount, periodDays] of limits) {
  const tx = new Transaction();
  tx.setSender(me);
  addAllowance(tx, { name: `Usual · ${category}`, spender: agent().toSuiAddress(), amount: BigInt(Math.round(amount * env.scale * 1e6)), periodDays });
  const r = await executeAndConfirm({ tx, signer: owner });
  const { allowances, caps } = createdAllowances(r.effects);
  console.log(`${category}: allowance ${allowances[0]} cap ${caps[0]} (${r.digest})`);
  await remember([{ type: "LIMIT", category, amount: String(Math.round(amount * env.scale * 1e6) / 1e6), periodDays, allowanceId: allowances[0], capId: caps[0] }]);
}
await flush();
