// A brand-new tester, end to end against a live server: fresh wallet, fresh device key, real testnet
// money, real Walrus memory. Does what the browser does, with keys held here instead of a device.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { sui } from "../src/lib/chain";
import { env } from "../src/lib/env";

const base = process.env.BASE ?? "http://localhost:3500";
const wallet = new Ed25519Keypair();
const device = new Ed25519Keypair();
const address = wallet.toSuiAddress();
const agent = device.toSuiAddress();
let cookie = "";
let failures = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test client reading loose JSON
async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${data.error ?? JSON.stringify(data)}`);
  return data;
}
const check = (label: string, ok: boolean, detail: unknown = "") => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${label} ${detail}`); };
const asOwner = async (bytes: string) => { const s = await wallet.signTransaction(fromBase64(bytes)); return { bytes: s.bytes, signature: s.signature }; };
const asDevice = async (bytes: string) => { const s = await device.signTransaction(fromBase64(bytes)); return { bytes: s.bytes, signature: s.signature }; };

const a = await api(`auth?address=${address}&agent=${agent}`);
const { signature } = await wallet.signPersonalMessage(new TextEncoder().encode(a.message));
await api("auth", { address, agent, at: a.at, signature });
const empty = await api("state");
check("any wallet signs in, starts empty", empty.owner === address && empty.balance.startsWith("0"), empty.balance);

// Claim a real mainnet memory account. This wallet has never held mainnet SUI: Walrus sponsors it.
const claim = async (revoke = false) => {
  const p = await api("memory/account", { action: "prepare", revoke });
  if (p.done) return false;
  const { signature } = await wallet.signPersonalMessage(new TextEncoder().encode(p.message));
  const s = await api("memory/account", { action: "sponsor", kind: p.kind, timestamp: p.timestamp, nonce: p.nonce, signature });
  const signed = await wallet.signTransaction(fromBase64(s.bytes));
  await api("memory/account", { action: "execute", digest: s.digest, signature: signed.signature });
  return true;
};
// No sample data: real test money, and a real person who has only an address.
await api("faucet", {});
const payee = new Ed25519Keypair().toSuiAddress();
let s = await api("state?fresh=1");
check("test money, no wallet approval, nothing invented", s.balance === "1000.00" && s.activity.length === 0 && s.questions.length === 0, s.balance);

const say = async (text: string, followUp?: unknown) => api("talk", { text, followUp });
const noise = await say("Sip");
check("noise never becomes a purchase", !noise.proposal, noise.say);
const who = await say("Send Mum 50");
check("a new person: asks for the address", who.needsAddress === "Mum" && !who.proposal, who.say);
const ticket = await say(payee, who.followUp);
check("pasted address continues the payment", ticket.proposal?.path === "owner", ticket.understood);
let last;
for (let i = 0; i < 3; i++) {
  const t = await say(i ? "Send Mum 50" : "Send Mum 50");
  const pay = await api("pay", { to: "Mum", amount: "50", path: "owner" });
  last = await api("submit", { kind: "pay", ...(await asOwner(pay.bytes)), meta: {} });
  check(`real payment ${i + 1}`, !!last.digest, t.say);
}
check("three clean payments: it applies for credit", last.followUp?.kind === "set_limit", last.say);
await new Promise((r) => setTimeout(r, 5000));
const usual = await say("Send Mum her usual");
check("it learned her usual from the chain", usual.proposal?.amount === "50", usual.understood);

const lim = await api("limit", { category: "family", amount: "100", periodDays: 7 });
const set = await api("submit", { kind: "limit", ...(await asOwner(lim.bytes)), meta: { category: "family", amount: "100", periodDays: 7 } });
check("limit signed by the owner", set.ok === true, set.say);

const reply = await say("Send Mum her usual");
check("inside the limit, the agent path", reply.proposal?.path === "agent", reply.say);
const pay = await api("pay", { to: "Mum", path: "agent" });
check("server cannot pay: it hands back bytes", !!pay.agentBytes);
const paid = await api("submit", { kind: "agent-pay", ...(await asDevice(pay.agentBytes)), meta: {} });
check("device key paid", paid.ok === true && !!paid.digest, paid.say);

// Call the payment wrong: the line stops at once, then one signature cuts it on the chain.
const line = (await api("state")).state.limits.family;
const wrong = await say("that was wrong");
const report = (await api("state")).credit;
const held = await say("Send Mum her usual");
check("a mistake stops the agent at once", report.suspended.includes("family") && held.proposal?.path === "owner", `${wrong.say} | ${held.say}`);
const cut = await api("limit", { category: "family", amount: wrong.followUp.amount, periodDays: wrong.followUp.periodDays });
const cutDone = await api("submit", { kind: "limit", ...(await asOwner(cut.bytes)), meta: { category: "family", amount: wrong.followUp.amount, periodDays: wrong.followUp.periodDays } });
const cutLine = (await api("state")).state.limits.family;
check("the cut is a new, smaller line on the chain", cutDone.ok === true && cutLine.amount === "50" && cutLine.allowanceId !== line.allowanceId, `${line.amount} to ${cutLine.amount}`);
const gone = await sui().core.getObject({ objectId: line.allowanceId }).then(() => false, () => true);
check("the old line no longer exists", gone);

const over = await say("Send Mum 500");
check("far over: owner signature", over.proposal?.path === "owner", over.say);

await say("remember that I shouldn't pay Mum until she confirms her new wallet");
const warned = await say("Send Mum her usual");
check("memory overrides the limit", warned.proposal?.path === "owner" && warned.say.includes("You told me"), warned.say);

await say("remember that my rent is due on the first of the month");
await new Promise((r) => setTimeout(r, 45_000));
const asked = await say("when do I have to pay rent?");
check("semantic recall answers", /first/i.test(asked.say), asked.say);

const cafe = await say("Buy a flat white at the café");
check("café proposal", cafe.proposal?.type === "cafe", cafe.say);
const needs = await api("cafe/pay", { item: "flat-white", path: "owner" });
const shot = await api("submit", { kind: "cafe", ...(await asOwner(needs.needsOwner)), meta: { item: "flat-white" } });
check("café hands the device a 402 to sign", !!shot.agentCafe);
const tx = await device.signTransaction(fromBase64(shot.agentCafe.bytes));
const proof = await device.signPersonalMessage(fromBase64(shot.agentCafe.proof));
const receipt = await api("cafe/finish", { item: "flat-white", challenge: shot.agentCafe.challenge, bytes: tx.bytes, signature: tx.signature, proofSignature: proof.signature });
check("MPP paid from the device", !!receipt.digest, receipt.say);

// Claiming later moves what Usual already learned into the wallet's own account.
const before = (await api("state?fresh=1")).memory.count;
await claim();
await claim();
const mine = await api("state?fresh=1");
check("wallet owns its memory account", !!mine.memory.account, mine.memory.account);
check("what Usual learned moved with it", mine.memory.count >= before && !!mine.state.contacts.mum, `${before} memories, then ${mine.memory.count}`);

// A deposit: test dollars arrive as a coin from somewhere else.
const operator = Ed25519Keypair.fromSecretKey(env.ownerKey);
const mint = new Transaction();
mint.setSender(operator.toSuiAddress());
mint.moveCall({ target: "0x2::coin::mint_and_transfer", typeArguments: [env.usdc], arguments: [mint.object(env.treasuryCap), mint.pure.u64(25_000_000n), mint.pure.address(address)] });
const dep = await sui().core.signAndExecuteTransaction({ transaction: mint, signer: operator });
await sui().core.waitForTransaction({ digest: (dep.Transaction ?? dep.FailedTransaction!).digest });
await new Promise((r) => setTimeout(r, 6000));
s = await api("state");
check("a deposit is noticed", s.loose === "25", s.loose);
const d = await api("deposit", {});
const added = await api("submit", { kind: "deposit", ...(await asOwner(d.bytes)), meta: {} });
check("owner moves it where limits reach", added.ok === true, added.say);

// Ownership means the owner can lock Usual out.
const before2 = await api("state");
await claim(true);
const after = await api("state?fresh=1");
const blind = await say("when do I have to pay rent?");
check("owner revokes, Usual knows nothing", after.memory.account === null && after.memoryOn === false && before2.memory.count > 0 && !/first/i.test(blind.say), `${before2.memory.count} memories, then ${after.memory.count}`);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
