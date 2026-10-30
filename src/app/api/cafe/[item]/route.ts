import { MENU, cafeServer } from "@/lib/mpp";


/** The café: an MPP merchant. 402 until a verified Sui USDC payment arrives, then a receipt. */
export async function GET(req: Request, ctx: RouteContext<"/api/cafe/[item]">) {
  const { item } = await ctx.params;
  const entry = MENU[item];
  if (!entry) return Response.json({ error: "not on the menu" }, { status: 404 });
  const r = await cafeServer().sui.charge({ amount: entry.price, description: entry.label })(req);
  if (r.status === 402) return r.challenge;
  return r.withReceipt(Response.json({ item, label: entry.label, served: true, at: new Date().toISOString() }));
}
