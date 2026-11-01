// One facade over money movement. Real mode: Tatum gRPC + Sui allowances + MPP.
// Mock mode (no keys): the same flows over an in-memory ledger, so anyone can try Usual.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { addAllowance, createdAllowances, depositToAddressBalance, revokeAllowance } from "./allowances";
import { agent, agentAddress, buildForOwner, executeAndConfirm, gasBalance, looseCoins, outgoingPayments, ownerAddress, simulate, transferTx, usdcBalance } from "./chain";
import { env, MOCK } from "./env";
import type { ChainPayment } from "./insights";
import { MENU, payWithAllowance, prepareAllowancePayment, quote, settleAllowancePayment } from "./mpp";
import { parseAmount } from "./money";
import { deviceAgent } from "./user";

const DAY = 86_400_000;
const hex = (c: string) => "0x" + c.repeat(64);
export const MOCK_ADDR = { owner: hex("0"), mum: hex("3"), gym: hex("9"), stream: hex("5"), cafe: hex("c") };

const g = globalThis as unknown as { __ledger?: { balance: bigint; history: ChainPayment[]; n: number } };
function ledger() {
  if (!g.__ledger) {
    const t = Date.now();
    const p = (to: string, amt: number, daysAgo: number): ChainPayment => ({ to, amount: BigInt(Math.round(amt * 1e6)), digest: `MOCK${daysAgo}${to.slice(2, 6)}`, at: t - daysAgo * DAY });
    g.__ledger = {
      balance: 462_500_000n,
      n: 0,
      history: [
        p(MOCK_ADDR.mum, 50, 3), p(MOCK_ADDR.mum, 50, 10), p(MOCK_ADDR.mum, 50, 17),
        p(MOCK_ADDR.gym, 35, 5), p(MOCK_ADDR.gym, 30, 35), p(MOCK_ADDR.gym, 30, 65),
        p(MOCK_ADDR.stream, 12, 12), p(MOCK_ADDR.stream, 12, 42), p(MOCK_ADDR.stream, 12, 72),
        p(MOCK_ADDR.cafe, 4.5, 2),
      ],
    };
  }
  return g.__ledger;
}
function mockSend(to: string, amount: bigint) {
  const l = ledger();
  if (amount > l.balance) throw new Error("insufficient balance");
  l.balance -= amount;
  const digest = `MOCK${Date.now().toString(36)}${(l.n++).toString(36)}`.toUpperCase();
  l.history.unshift({ to, amount, digest, at: Date.now() });
  return { digest, confirmed: true };
}

export const owner = () => (MOCK ? MOCK_ADDR.owner : ownerAddress());
export const cafeAddress = () => (MOCK ? MOCK_ADDR.cafe : env.cafe);
export const balance = () => (MOCK ? Promise.resolve(ledger().balance) : usdcBalance(owner()));
export const history = () => (MOCK ? Promise.resolve(ledger().history) : outgoingPayments(owner()));

export type Path = "agent" | "owner";

/** Dry-run the payment through Tatum to show the balance after. Agent path only when an allowance covers it. */
export async function preview(to: string, amount: bigint, allowanceId?: string) {
  const path: Path = allowanceId ? "agent" : "owner";
  const bal = await balance();
  if (MOCK) return { path, ok: amount <= bal, error: amount <= bal ? null : "insufficient balance", balanceAfter: bal - amount, simulated: false };
  const tx = path === "agent"
    ? transferTx({ sender: agentAddress(), to, amount, allowance: { objectId: allowanceId!, funder: owner() } })
    : transferTx({ sender: owner(), to, amount });
  try {
    const sim = await simulate(tx, owner());
    return { path, ok: sim.ok, error: sim.error, balanceAfter: bal + sim.delta, simulated: true };
  } catch (e) {
    return { path, ok: false, error: (e as Error).message, balanceAfter: bal - amount, simulated: false };
  }
}

/** The agent key pays from the owner's balance, inside the allowance. The chain rejects anything over it. */
export async function agentPay(to: string, amount: bigint, allowanceId: string) {
  if (MOCK) return mockSend(to, amount);
  const tx = transferTx({ sender: agent().toSuiAddress(), to, amount, allowance: { objectId: allowanceId, funder: owner() } });
  return executeAndConfirm({ tx, signer: agent() });
}

/** Unsigned bytes for the agent key on the user's device. */
export const agentPayBytes = (to: string, amount: bigint, allowanceId: string) =>
  buildForOwner(transferTx({ sender: agentAddress(), to, amount, allowance: { objectId: allowanceId, funder: owner() } }));

export const onDevice = () => !MOCK && !!deviceAgent();

/** Unsigned transaction bytes for the owner's wallet. */
export async function ownerPayBytes(to: string, amount: bigint) {
  if (MOCK) return mockBytes({ kind: "pay", to, amount: String(amount) });
  return buildForOwner(transferTx({ sender: owner(), to, amount }));
}

/** New limit = revoke the old allowance (if any) + issue a new rate-limited one, signed by the owner. */
export async function limitBytes(opts: { category: string; amount: bigint; periodDays: number; old?: { capId: string; allowanceId: string } }) {
  if (MOCK) return mockBytes({ kind: "limit", ...opts, amount: String(opts.amount) });
  const tx = new Transaction();
  tx.setSender(owner());
  if (opts.old) revokeAllowance(tx, opts.old.capId, opts.old.allowanceId);
  addAllowance(tx, { name: `Usual · ${opts.category}`, spender: agentAddress(), amount: opts.amount, periodDays: opts.periodDays });
  await fuelAgent(tx);
  return buildForOwner(tx);
}

/** One-shot approval above a limit: an allowance for exactly this amount that expires in 10 minutes. */
export async function oneShotBytes(label: string, amount: bigint) {
  if (MOCK) return mockBytes({ kind: "oneshot", amount: String(amount) });
  const tx = new Transaction();
  tx.setSender(owner());
  addAllowance(tx, { name: `Usual · once · ${label}`, spender: agentAddress(), amount, lifetime: { expiresAt: Date.now() + 10 * 60_000 } });
  await fuelAgent(tx);
  return buildForOwner(tx);
}

const dollars = (n: number) => BigInt(Math.round(n * 1e6));
const TEST_MONEY = dollars(1000);
const OWNER_GAS = 50_000_000n; // 0.05 SUI: the owner's approvals plus the agent's fuel.
const AGENT_GAS = 20_000_000n;
const LOW_GAS = 30_000_000n;
// Oldest first, so the gym's rise from 30 to 35 shows up as a price change.
const SAMPLE_PAYMENTS = [[50, 30, 12], [50, 30, 12], [50, 35, 12]];
export const sampleRounds = SAMPLE_PAYMENTS.length;

/** The device key pays its own gas, so whoever signs for it tops it up in the same approval. */
async function fuelAgent(tx: Transaction) {
  const spender = deviceAgent();
  if (!spender || (await gasBalance(spender)) >= AGENT_GAS / 4n) return;
  if (env.treasuryCap) await claimTestMoney();
  const [fuel] = tx.splitCoins(tx.gas, [AGENT_GAS]);
  tx.transferObjects([fuel], spender);
}

/** Public testnet: fill an empty wallet with test dollars and gas. Anyone signed in can ask; a funded wallet gets nothing. */
export async function claimTestMoney() {
  if (MOCK) return;
  if (!env.treasuryCap) throw new Error("test money isn't set up on this deployment");
  const me = owner();
  const [money, gas] = await Promise.all([usdcBalance(me), gasBalance(me)]);
  if (money > 0n && gas >= LOW_GAS) return;
  const faucet = Ed25519Keypair.fromSecretKey(env.ownerKey);
  const tx = new Transaction();
  tx.setSender(faucet.toSuiAddress());
  if (money === 0n) {
    const coin = tx.moveCall({ target: "0x2::coin::mint", typeArguments: [env.usdc], arguments: [tx.object(env.treasuryCap), tx.pure.u64(TEST_MONEY)] });
    tx.moveCall({ target: "0x2::coin::send_funds", typeArguments: [env.usdc], arguments: [coin, tx.pure.address(me)] });
  }
  if (gas < LOW_GAS) {
    const [fuel] = tx.splitCoins(tx.gas, [OWNER_GAS]);
    tx.transferObjects([fuel], me);
  }
  await executeAndConfirm({ tx, signer: faucet });
}

/** One approval lets the device key lay down sample history, so a new wallet has patterns to learn from. */
export async function starterBytes() {
  if (MOCK) return mockBytes({ kind: "oneshot", amount: "0" });
  return oneShotBytes("sample payments", SAMPLE_PAYMENTS.flat().reduce((sum, n) => sum + dollars(n), 0n));
}

/** One transaction paying all three sample payees, spent from the one-shot allowance. */
export async function seedBytes(allowanceId: string, round: number) {
  const from = { objectId: allowanceId, funder: owner() };
  const tx = new Transaction();
  tx.setSender(agentAddress());
  SAMPLE_PAYMENTS[round].forEach((amount, i) => {
    const coin = tx.coin({ balance: dollars(amount), type: env.usdc, allowance: from });
    tx.transferObjects([coin], [MOCK_ADDR.mum, MOCK_ADDR.gym, MOCK_ADDR.stream][i]);
  });
  return buildForOwner(tx);
}

/** Money sitting as loose coins, waiting to be moved where limits can reach it. */
export const looseBalance = async () => (MOCK ? 0n : (await looseCoins(owner())).total);

export async function depositBytes() {
  if (MOCK) return mockBytes({ kind: "deposit" });
  const tx = new Transaction();
  tx.setSender(owner());
  depositToAddressBalance(tx, owner(), (await looseCoins(owner())).ids);
  return buildForOwner(tx);
}

// Mock "transactions" are JSON; the mock wallet "signs" them by echoing.
const mockBytes = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString("base64");

/** Execute owner-signed bytes through Tatum and confirm. Returns created allowance IDs and what moved. */
export async function submitSigned(bytesB64: string, signature: string) {
  if (MOCK) {
    const o = JSON.parse(Buffer.from(bytesB64, "base64").toString());
    if (o.kind === "pay") return { ...mockSend(o.to, BigInt(o.amount)), allowances: [], caps: [], payment: { to: o.to, amount: BigInt(o.amount) } };
    const id = `0xMOCKALLOW${Date.now().toString(16)}`;
    return { digest: `MOCK${o.kind}`.toUpperCase(), confirmed: true, allowances: [id], caps: [`${id}CAP`], payment: null };
  }
  const r = await executeAndConfirm({ bytes: Buffer.from(bytesB64, "base64"), signature });
  const { allowances, caps } = createdAllowances(r.effects);
  const paid = r.changes.find((c) => c.coinType === env.usdc && c.address !== owner() && BigInt(c.amount) > 0n);
  return { ...r, allowances, caps, payment: paid ? { to: paid.address, amount: BigInt(paid.amount) } : null };
}

export async function cafeQuote(item: string, origin: string) {
  const price = MENU[item]?.price;
  if (!price) throw new Error(`unknown item ${item}`);
  if (MOCK) return { amount: parseAmount(price)!, recipient: cafeAddress(), label: MENU[item].label };
  const q = await quote(`${origin}/api/cafe/${item}`);
  return { ...q, label: MENU[item].label };
}

/** Device path: everything the device must sign to pay this 402. */
export const cafePrepare = (item: string, origin: string, allowanceId: string, max: bigint) =>
  prepareAllowancePayment(`${origin}/api/cafe/${item}`, { objectId: allowanceId, funder: owner() }, agentAddress(), max);

export const cafeSettle = (item: string, origin: string, challenge: string, bytes: string, signature: string, proofSignature: string) =>
  settleAllowancePayment(`${origin}/api/cafe/${item}`, challenge, bytes, signature, proofSignature);

export async function cafePay(item: string, origin: string, allowanceId: string, max: bigint) {
  if (MOCK) {
    const r = mockSend(cafeAddress(), max);
    return { digest: r.digest, receipt: "mock-receipt", body: { item, served: true } };
  }
  return payWithAllowance(`${origin}/api/cafe/${item}`, { objectId: allowanceId, funder: owner() }, max);
}
