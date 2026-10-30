// Devnet has no USDC and the testnet faucets need a captcha. This publishes "Usual Test Dollar" (TUSD,
// 6 decimals) on devnet from the standard coin template, mints test dollars to the demo owner, funds the
// agent with devnet SUI for gas, and points .env at devnet + TUSD. Run: pnpm devnet:setup
import { readFileSync, writeFileSync } from "node:fs";
import { bcs } from "@mysten/sui/bcs";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import * as template from "@mysten/move-bytecode-template";
import { agent, ownerAddress, sui } from "../src/lib/chain";
import { env } from "../src/lib/env";
import { COIN_TEMPLATE_HEX } from "./coin-template";

if (env.network !== "devnet") throw new Error("run with SUI_NETWORK=devnet (the package script sets it)");
const owner = Ed25519Keypair.fromSecretKey(env.ownerKey);
const me = ownerAddress();

for (const addr of [me, agent().toSuiAddress()]) {
  const r = await requestSuiFromFaucetV2({ host: getFaucetHost("devnet"), recipient: addr }).catch((e) => ({ status: String(e) }));
  console.log(`faucet ${addr.slice(0, 10)}…: ${typeof r.status === "string" ? r.status : JSON.stringify(r.status)}`);
}

let bytes = template.update_identifiers(fromHex(COIN_TEMPLATE_HEX), { TEMPLATE: "TUSD", template: "tusd" });
const str = (s: string) => bcs.string().serialize(s).toBytes();
bytes = template.update_constants(bytes, str("TUSD"), str("TMPL"), "Vector(U8)");
bytes = template.update_constants(bytes, str("Usual Test Dollar"), str("Template Coin"), "Vector(U8)");
bytes = template.update_constants(bytes, str("Test dollar for the Usual demo on Sui devnet. No value."), str("Template Coin Description"), "Vector(U8)");

const pub = new Transaction();
pub.setSender(me);
const [upgradeCap] = pub.publish({ modules: [[...bytes]], dependencies: ["0x1", "0x2"] });
pub.transferObjects([upgradeCap], me);
const res = await sui().core.signAndExecuteTransaction({ transaction: pub, signer: owner, include: { effects: true, objectTypes: true } });
const t = res.Transaction ?? res.FailedTransaction!;
if (!t.status.success) throw new Error(`publish failed: ${t.status.error?.message}`);
await sui().core.waitForTransaction({ digest: t.digest });
const types = t.objectTypes ?? {};
const treasury = Object.entries(types).find(([, ty]) => ty.includes("::coin::TreasuryCap<"));
if (!treasury) throw new Error("no TreasuryCap in publish effects");
const coinType = treasury[1].match(/TreasuryCap<(.+)>$/)![1];
console.log(`published ${coinType} (${t.digest})`);

const mint = new Transaction();
mint.setSender(me);
mint.moveCall({ target: "0x2::coin::mint_and_transfer", typeArguments: [coinType], arguments: [mint.object(treasury[0]), mint.pure.u64(10_000n * 1_000_000n), mint.pure.address(me)] });
const m = await sui().core.signAndExecuteTransaction({ transaction: mint, signer: owner, include: { effects: true } });
await sui().core.waitForTransaction({ digest: (m.Transaction ?? m.FailedTransaction!).digest });
console.log(`minted 10000 TUSD to owner (${(m.Transaction ?? m.FailedTransaction!).digest})`);

let dotenv = readFileSync(".env", "utf8");
const set = (k: string, v: string) => {
  dotenv = new RegExp(`^${k}=`, "m").test(dotenv) ? dotenv.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : `${dotenv.trimEnd()}\n${k}=${v}\n`;
};
set("SUI_NETWORK", "devnet");
set("TATUM_SUI_GRPC_URL", "sui-devnet-grpc.gateway.tatum.io:443");
set("USDC_TYPE", coinType);
set("CURRENCY_SYMBOL", "TUSD");
set("TUSD_TREASURY_CAP", treasury[0]);
writeFileSync(".env", dotenv, { mode: 0o600 });
console.log(".env now points at devnet + TUSD");
