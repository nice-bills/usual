// Generates every local key Usual needs and writes missing ones into .env.
// Prints public addresses only; private keys never reach the terminal.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as ed from "@noble/ed25519";
import { randomBytes } from "node:crypto";

const path = ".env";
let env = existsSync(path) ? readFileSync(path, "utf8") : readFileSync(".env.example", "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=([^\\s#]*)`, "m"))?.[1] ?? "";
const set = (k: string, v: string) => {
  env = env.match(new RegExp(`^${k}=`, "m"))
    ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`)
    : `${env.trimEnd()}\n${k}=${v}\n`;
};

for (const k of ["AGENT_SUI_PRIVATE_KEY", "OWNER_SUI_PRIVATE_KEY", "PAYEE_MUM_PRIVATE_KEY", "PAYEE_GYM_PRIVATE_KEY", "PAYEE_STREAM_PRIVATE_KEY"]) {
  if (!get(k)) set(k, Ed25519Keypair.generate().getSecretKey());
}
const cafe = Ed25519Keypair.generate();
if (!get("CAFE_RECIPIENT_ADDRESS")) set("CAFE_RECIPIENT_ADDRESS", cafe.toSuiAddress());
if (!get("MEMWAL_PRIVATE_KEY")) set("MEMWAL_PRIVATE_KEY", randomBytes(32).toString("hex"));
writeFileSync(path, env, { mode: 0o600 });

const addr = (k: string) => Ed25519Keypair.fromSecretKey(get(k)).toSuiAddress();
const delegatePub = bytesToHex(await ed.getPublicKeyAsync(Buffer.from(get("MEMWAL_PRIVATE_KEY"), "hex")));
console.log(`owner (fund with test SUI + USDC): ${addr("OWNER_SUI_PRIVATE_KEY")}
agent (fund with test SUI for gas):  ${addr("AGENT_SUI_PRIVATE_KEY")}
mum:    ${addr("PAYEE_MUM_PRIVATE_KEY")}
gym:    ${addr("PAYEE_GYM_PRIVATE_KEY")}
stream: ${addr("PAYEE_STREAM_PRIVATE_KEY")}
cafe:   ${get("CAFE_RECIPIENT_ADDRESS")}
Walrus Memory delegate public key (add under Delegate keys): ${delegatePub}`);
