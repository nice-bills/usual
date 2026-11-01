import { json, owned } from "@/lib/http";
import { claimTestMoney } from "@/lib/wallet";

/** Fill an empty testnet wallet. */
export const POST = owned(async () => {
  await claimTestMoney();
  return json({ ok: true });
});
