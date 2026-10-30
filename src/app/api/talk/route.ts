import { z } from "zod";
import { talk } from "@/lib/agent";
import { json, owned } from "@/lib/http";

const Body = z.object({
  text: z.string().trim().min(1).max(500),
  asking: z.object({ address: z.string(), text: z.string(), count: z.number(), usual: z.string() }).nullish(),
  followUp: z.record(z.string(), z.unknown()).nullish(),
  skip: z.array(z.string()).max(50).optional(),
});

export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  return json(await talk(b.text, { asking: b.asking, followUp: b.followUp as never, skip: b.skip }));
});
