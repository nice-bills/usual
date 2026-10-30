import { z } from "zod";
import { json, owned } from "@/lib/http";
import { memoryOn, proof, setMemoryOn } from "@/lib/memory";


export const GET = owned(async () => json({ on: memoryOn(), ...(await proof()) }));

/** Memory on/off, for the before/after demo. */
export const POST = owned(async (req) => {
  const { on } = z.object({ on: z.boolean() }).parse(await req.json());
  setMemoryOn(on);
  return json({ on });
});
