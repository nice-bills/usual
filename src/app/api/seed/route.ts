import { z } from "zod";
import { json, owned } from "@/lib/http";
import { sampleRounds, seedBytes } from "@/lib/wallet";

const Body = z.object({ round: z.number().int().min(0).max(sampleRounds - 1) });

/** One round of sample payments for the device key to sign. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  return json({ bytes: await seedBytes(b.round) });
});
