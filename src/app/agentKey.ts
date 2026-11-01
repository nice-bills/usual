// The agent's key lives on this device, one per wallet. WebCrypto keeps it non-extractable, so page
// code can ask it to sign but can never read it out. The server only ever sees its address and
// its signatures, and the chain limits what those signatures can do.
import { Signer, type SignatureScheme } from "@mysten/sui/cryptography";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";

class DeviceKey extends Signer {
  constructor(private pair: CryptoKeyPair, private publicKey: Ed25519PublicKey) { super(); }
  async sign(bytes: Uint8Array) {
    return new Uint8Array(await crypto.subtle.sign("Ed25519", this.pair.privateKey, bytes as BufferSource));
  }
  getKeyScheme = (): SignatureScheme => "ED25519";
  getPublicKey = () => this.publicKey;
}

function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("usual", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction("keys", mode).objectStore("keys"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

const loaded = new Map<string, Promise<DeviceKey>>();
async function create(wallet: string) {
  let pair = await store<CryptoKeyPair | undefined>("readonly", (s) => s.get(wallet));
  if (!pair) {
    pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]) as CryptoKeyPair;
    await store("readwrite", (s) => s.put(pair, wallet));
  }
  return new DeviceKey(pair, new Ed25519PublicKey(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))));
}

/** This wallet's agent key on this device, made on first use. */
export function agentKey(wallet: string) {
  if (!loaded.has(wallet)) loaded.set(wallet, create(wallet));
  return loaded.get(wallet)!;
}
