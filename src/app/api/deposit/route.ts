import { json, owned } from "@/lib/http";
import { depositBytes } from "@/lib/wallet";

/** Move money that arrived as loose coins into the balance limits can draw from. The owner signs. */
export const POST = owned(async () => json({ bytes: await depositBytes() }));
