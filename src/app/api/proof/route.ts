import { agent, ownerAddress, simulate, transferTx } from "@/lib/chain";
import { env, MOCK } from "@/lib/env";
import { json } from "@/lib/http";
import { load, proof } from "@/lib/memory";

/** Public evidence: memory counts and blob IDs, plus a live dry-run of the agent going over a limit. */
export async function GET() {
  if (MOCK) return json({ mock: true });
  const memory = await proof();
  const food = (await load()).state.limits.food;
  let refusal: string | null = null;
  if (food?.allowanceId) {
    const tx = transferTx({ sender: agent().toSuiAddress(), to: env.cafe, amount: 1_000_000_000n, allowance: { objectId: food.allowanceId, funder: ownerAddress() } });
    refusal = (await simulate(tx, ownerAddress())).error;
  }
  return json({ mock: false, network: env.network, account: env.memwalAccount, namespace: env.memwalNamespace, count: memory.count, blobs: memory.blobs.slice(0, 5), limit: food ? `${food.amount} ${env.symbol} a day` : null, refusal });
}
