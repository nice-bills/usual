import { z } from "zod";
import { json, owned } from "@/lib/http";
import { accountChanged, claimStarted } from "@/lib/memory";
import { execute, memoryAccount, nextStep, prepare, sponsor } from "@/lib/memoryAccount";
import { currentUser } from "@/lib/user";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), revoke: z.boolean().optional() }),
  z.object({ action: z.literal("sponsor"), kind: z.string().min(1), timestamp: z.number(), nonce: z.string().uuid(), signature: z.string().min(1) }),
  z.object({ action: z.literal("execute"), digest: z.string().min(1).max(64), signature: z.string().min(1) }),
]);

/** One sponsored step at a time. The sender always comes from the session, never the request. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  const owner = currentUser();
  if (!owner) return json({ error: "Connect your wallet first." }, { status: 401 });
  if (b.action === "sponsor") return json(await sponsor(owner, b.kind, b.timestamp, b.nonce, b.signature));
  const account = await memoryAccount(owner);
  if (b.action === "execute") {
    const now = await execute(owner, b.digest, b.signature, account);
    await accountChanged();
    return json(now);
  }
  const step = b.revoke ? (account.authorized ? "remove" : null) : nextStep(account);
  if (step && !b.revoke) claimStarted();
  return json(step ? { step, ...(await prepare(owner, step, account.accountId)) } : { done: true });
});
