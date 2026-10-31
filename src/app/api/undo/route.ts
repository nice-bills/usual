import { z } from "zod";
import { json, owned } from "@/lib/http";
import { remember } from "@/lib/memory";
import type { Rec } from "@/lib/records";

const Body = z.object({ records: z.array(z.looseObject({ type: z.enum(["CONTACT", "USUAL", "SUBSCRIPTION"]) })).min(1).max(5) });

/** Takes back the last memory change. Newer records win, so undo is one more write. Never touches money. */
export const POST = owned(async (req) => {
  const { records } = Body.parse(await req.json());
  await remember(records as unknown as Rec[]);
  return json({ ok: true });
});
