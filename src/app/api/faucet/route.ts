import { json, owned } from "@/lib/http";
import { claimTestMoney, starterBytes } from "@/lib/wallet";

/** Fill an empty testnet wallet, then return the approval that lays down sample history. */
export const POST = owned(async () => {
  await claimTestMoney();
  return json({ bytes: await starterBytes() });
});
