import { agent, ownerAddress, simulate, transferTx } from "@/lib/chain";
import { env, MOCK } from "@/lib/env";
import { json } from "@/lib/http";
import { load, proof } from "@/lib/memory";
import { formatAmount, parseAmount } from "@/lib/money";

/** Public evidence: memory counts and blob IDs, plus a live dry-run of the agent going over a limit. */
export async function GET() {
  if (MOCK) return json({ mock: true });
  const memory = await proof();
  const food = (await load()).state.limits.food;
  let refusal: string | null = null;
  let attempted: string | null = null;
  if (food?.allowanceId) {
    // One cent over the limit: within the owner's balance, so only the allowance can refuse it.
    const amount = (parseAmount(food.amount) ?? 0n) + 10_000n;
    attempted = formatAmount(amount);
    const tx = transferTx({ sender: agent().toSuiAddress(), to: env.cafe, amount, allowance: { objectId: food.allowanceId, funder: ownerAddress() } });
    refusal = await simulate(tx, ownerAddress()).then((r) => r.error, (e: Error) => e.message);
  }
  return json({ attempted, mock: false, network: env.network, account: env.memwalAccount, namespace: env.memwalNamespace, count: memory.count, blobs: memory.blobs.slice(0, 5), limit: food ? `${food.amount} ${env.symbol} a day` : null, refusal });
}
