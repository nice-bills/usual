import { snapshot } from "@/lib/agent";
import { json, owned } from "@/lib/http";


/** Everything Usual knows, rebuilt from Walrus Memory (`?fresh=1` skips the short cache). */
export const GET = owned(async (req) => {
  const u = new URL(req.url);
  const skip = u.searchParams.get("skip")?.split(",").filter(Boolean) ?? [];
  return json(await snapshot(u.searchParams.get("fresh") === "1", skip));
});
