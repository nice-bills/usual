// Live owner paths on testnet: owner-signed payment, one-shot café approval, limit reissue.
// The demo owner key signs here, standing in for the browser wallet popup.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterSigned, ownerPay, payCafe } from "../src/lib/agent";
import { env } from "../src/lib/env";
import { flush, load } from "../src/lib/memory";
import { parseAmount } from "../src/lib/money";
import { limitBytes, oneShotBytes, cafeQuote } from "../src/lib/wallet";

const owner = Ed25519Keypair.fromSecretKey(env.ownerKey);
const sign = async (b64: string) => (await owner.signTransaction(Buffer.from(b64, "base64"))).signature;
const origin = process.env.PUBLIC_ORIGIN!;

const p = await ownerPay("Mum", "0.10");
if (!p.ok) throw new Error(p.say);
console.log("owner pay:", JSON.stringify(await afterSigned("pay", p.bytes, await sign(p.bytes), {})));

const over = await payCafe("flat-white", undefined);
console.log("café over limit:", over.say, !!over.needsOwner);
const q = await cafeQuote("flat-white", origin);
const shot = await oneShotBytes(q.label, q.amount);
console.log("one-shot:", JSON.stringify(await afterSigned("cafe", shot, await sign(shot), { item: "flat-white" })).slice(0, 200));

const { state } = await load(true);
const old = state.limits.food;
const amount = parseAmount("0.15")!;
const lim = await limitBytes({ category: "food", amount, periodDays: 1, old: old?.capId && old.allowanceId ? { capId: old.capId, allowanceId: old.allowanceId } : undefined });
console.log("limit:", JSON.stringify(await afterSigned("limit", lim, await sign(lim), { category: "food", amount: "0.15", periodDays: 1 })));
await flush();
