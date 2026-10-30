import { z } from "zod";
import { json, owned } from "@/lib/http";
import { load } from "@/lib/memory";
import { parseAmount } from "@/lib/money";
import { CATEGORIES } from "@/lib/records";
import { limitBytes } from "@/lib/wallet";

const Body = z.object({ category: z.enum(CATEGORIES as [string, ...string[]]), amount: z.string(), periodDays: z.number().int().min(1).max(366) });

/** Bytes for the owner to sign: revoke the old allowance for this category (if any) and issue the new one. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  const amount = parseAmount(b.amount);
  if (amount == null) return json({ error: "bad amount" }, { status: 400 });
  const old = (await load()).state.limits[b.category as keyof object] as { capId?: string; allowanceId?: string } | undefined;
  const bytes = await limitBytes({ category: b.category, amount, periodDays: b.periodDays, old: old?.capId && old.allowanceId ? { capId: old.capId, allowanceId: old.allowanceId } : undefined });
  return json({ bytes });
});
