// Live end-to-end on testnet + Walrus Mainnet: cold start, naming, the usual (agent via allowance),
// the café over MPP inside the food allowance, and the summary. Needs the app running at PUBLIC_ORIGIN.
import { confirmPay, payCafe, snapshot, talk, type Question } from "../src/lib/agent";
import { flush } from "../src/lib/memory";

const s = await snapshot(true);
console.log(`balance ${s.balance} ${s.symbol} · memories ${s.memory.count} (${s.memory.source}) ${s.memory.error ?? ""}`);
let asking: Question | null = s.questions[0] ?? null;
const skip: string[] = [];
for (const answer of ["That's Mum", "that's my gym", "It's Streamly, a streaming subscription"]) {
  if (!asking) break;
  console.log(`Usual: ${asking.text}\nUser:  ${answer}`);
  const r = await talk(answer, { asking, skip });
  skip.push(asking.address);
  console.log(`Usual: ${r.say}`);
  asking = r.asking ?? null;
}
await flush();
const pay = await talk("Send Mum her usual", {});
console.log(`understood: ${pay.understood}\npath: ${pay.proposal?.type === "pay" ? pay.proposal.path : "-"}`);
const paid = await confirmPay("Mum");
console.log("paid:", JSON.stringify(paid).slice(0, 220));
const cafe = await payCafe("croissant", undefined);
console.log("café:", JSON.stringify(cafe).slice(0, 220));
const sum = await talk("What am I wasting money on?", {});
console.log(`summary: ${sum.say}`);
await flush();
