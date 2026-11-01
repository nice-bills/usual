// Agent payments over MPP (HTTP 402), settled in a Sui dollar coin (USDC; TUSD on devnet).
// Server: a café endpoint that charges via @suimpp/mpp. Client: the agent pays the 402
// from an allowance on the owner's balance, so the chain enforces the learned limit.
import { InMemoryDigestStore, sui as suiServer } from "@suimpp/mpp/server";
import { suiCharge } from "@suimpp/mpp/client";
import { Challenge, Credential, Method } from "mppx";
import { Mppx } from "mppx/server";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { agent, buildForOwner, executeAndConfirm, transferTx } from "./chain";
import { env } from "./env";
import { formatAmount, parseAmount } from "./money";

const price = (p: number) => (Math.round(p * env.scale * 100) / 100).toFixed(2);
export const MENU: Record<string, { label: string; price: string }> = {
  "flat-white": { label: "Flat white", price: price(4.5) },
  croissant: { label: "Croissant", price: price(2) },
  breakfast: { label: "Breakfast set", price: price(12) },
};

// The configured coin: USDC on testnet/mainnet, our TUSD on devnet.
const currency = { type: env.usdc, decimals: 6 };

const createCafe = () =>
  Mppx.create({
    realm: "usual-cafe",
    secretKey: env.sessionSecret,
    methods: [suiServer({ currency, recipient: env.cafe, network: env.network, store: new InMemoryDigestStore() })],
  });
let cafe: ReturnType<typeof createCafe> | undefined;
/** The merchant side. Verifies the payment on-chain before serving the receipt. */
export const cafeServer = () => (cafe ??= createCafe());

// Same message @suimpp/mpp signs: binds the digest to the on-chain sender.
const proofBytes = (challenge: { id: string; method: string; intent: string; request: Record<string, unknown> }, digest: string) =>
  new TextEncoder().encode(JSON.stringify({
    domain: "suimpp.sui.payment-proof", version: 1, method: challenge.method, intent: challenge.intent,
    challengeId: challenge.id, amount: challenge.request.amount, currency: challenge.request.currency, recipient: challenge.request.recipient, digest,
  }));

/** Read a 402 without paying: what the merchant asks for. */
export async function quote(url: string) {
  const res = await fetch(url);
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  const challenge = Challenge.fromResponse(res, { methods: [suiCharge] });
  const amount = parseAmount(challenge.request.amount);
  if (amount == null) throw new Error("bad amount in challenge");
  return { amount, recipient: challenge.request.recipient as string, currency: challenge.request.currency as string };
}

/** Device path, step 1: read the 402 and build what the device must sign. The digest is known before it lands. */
export async function prepareAllowancePayment(url: string, allowance: { objectId: string; funder: string }, sender: string, maxAmount: bigint) {
  const res = await fetch(url);
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  const challenge = Challenge.fromResponse(res, { methods: [suiCharge] });
  if (challenge.request.currency !== currency.type) throw new Error(`unsupported currency ${challenge.request.currency}`);
  const amount = parseAmount(challenge.request.amount);
  if (amount == null || amount > maxAmount) throw new Error(`merchant asked ${challenge.request.amount}, approved ${formatAmount(maxAmount)}`);
  const bytes = await buildForOwner(transferTx({ sender, to: challenge.request.recipient, amount, allowance }));
  const digest = TransactionDataBuilder.getDigestFromBytes(Buffer.from(bytes, "base64"));
  return { bytes, proof: Buffer.from(proofBytes(challenge, digest)).toString("base64"), challenge: JSON.stringify(challenge) };
}

/** Device path, step 2: land the signed payment, then present the signed proof to the merchant. */
export async function settleAllowancePayment(url: string, challengeJson: string, bytes: string, signature: string, proofSignature: string) {
  const { digest } = await executeAndConfirm({ bytes: Buffer.from(bytes, "base64"), signature });
  const credential = Credential.serialize({ challenge: JSON.parse(challengeJson), payload: { digest, signature: proofSignature } });
  const res = await fetch(url, { headers: { authorization: credential } });
  if (!res.ok) throw new Error(`café refused payment: ${res.status} ${await res.text()}`);
  return { digest, receipt: res.headers.get("payment-receipt"), body: await res.json() };
}

/** Pay a 402 endpoint with the agent key, drawing from `allowanceId` on the owner's balance. */
export async function payWithAllowance(url: string, allowance: { objectId: string; funder: string }, maxAmount: bigint) {
  const signer = agent();
  let digest = "";
  const method = Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      if (challenge.request.currency !== currency.type) throw new Error(`unsupported currency ${challenge.request.currency}`);
      const amount = parseAmount(challenge.request.amount);
      if (amount == null || amount > maxAmount) throw new Error(`merchant asked ${challenge.request.amount}, approved ${formatAmount(maxAmount)}`);
      const tx = transferTx({ sender: signer.toSuiAddress(), to: challenge.request.recipient, amount, allowance });
      ({ digest } = await executeAndConfirm({ tx, signer }));
      const proof = await signer.signPersonalMessage(proofBytes(challenge, digest));
      return Credential.serialize({ challenge, payload: { digest, signature: proof.signature } });
    },
  });
  const { Mppx: Client } = await import("mppx/client");
  const client = Client.create({ methods: [method], polyfill: false });
  const res = await client.fetch(url);
  if (!res.ok) throw new Error(`café refused payment: ${res.status} ${await res.text()}`);
  return { digest, receipt: res.headers.get("payment-receipt"), body: await res.json() };
}
