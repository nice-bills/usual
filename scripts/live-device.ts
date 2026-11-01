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
await api("faucet", {});
for (let round = 0; round < 3; round++) {
  const next = await api("seed", { round });
  await api("submit", { kind: "seed", ...(await asDevice(next.bytes)), meta: {} });
}
await new Promise((r) => setTimeout(r, 4000));
let s = await api("state?fresh=1");
check("no wallet approval needed: history comes from the chain", s.questions.length === 3, `${s.balance} ${s.symbol}, ${s.questions.length} questions`);

const say = async (text: string, asking?: unknown, followUp?: unknown) => api("talk", { text, asking, followUp });
const noise = await say("Sip");
check("noise never becomes a purchase", !noise.proposal, noise.say);
const mum = s.questions.find((q: { usual: string }) => q.usual.startsWith("50"));
check("names a payee", (await say("That's Mum", mum)).say.includes("Mum"));
await new Promise((r) => setTimeout(r, 1000));
s = await api("state");
await say("my gym", s.questions.find((q: { usual: string }) => !q.usual.startsWith("12")));
s = await api("state");
const last = await say("It's Streamly, a streaming subscription", s.questions[0]);
console.log("    ", last.say);

const lim = await api("limit", { category: "family", amount: "100", periodDays: 7 });
const set = await api("submit", { kind: "limit", ...(await asOwner(lim.bytes)), meta: { category: "family", amount: "100", periodDays: 7 } });
check("limit signed by the owner", set.ok === true, set.say);

const reply = await say("Send Mum her usual");
check("inside the limit, the agent path", reply.proposal?.path === "agent", reply.say);
const pay = await api("pay", { to: "Mum", path: "agent" });
check("server cannot pay: it hands back bytes", !!pay.agentBytes);
const paid = await api("submit", { kind: "agent-pay", ...(await asDevice(pay.agentBytes)), meta: {} });
check("device key paid", paid.ok === true && !!paid.digest, paid.say);

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
const held = await api("state");
await claim(true);
const after = await api("state?fresh=1");
const blind = await say("when do I have to pay rent?");
check("owner revokes, Usual knows nothing", after.memory.account === null && after.memoryOn === false && held.memory.count > 0 && !/first/i.test(blind.say), `${held.memory.count} memories, then ${after.memory.count}`);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
