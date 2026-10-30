// Walrus Memory only: health, one Mainnet write, recall. Runs before the Tatum key exists.
import { MemWal } from "@mysten-incubation/memwal";
import { env } from "../src/lib/env";

const m = MemWal.create({ key: env.memwalKey, accountId: env.memwalAccount, serverUrl: env.memwalUrl, namespace: env.memwalNamespace });
console.log("health", JSON.stringify(await m.health()).slice(0, 160));
const job = await m.remember(`Gate check: Usual connected at ${new Date().toISOString()}.`);
console.log("accepted", job.job_id);
const r = await m.waitForRememberJob(job.job_id, { timeoutMs: 180_000 });
console.log("stored", JSON.stringify(r).slice(0, 200));
const hits = await m.recall({ query: "Usual gate check connected", limit: 3 });
console.log("recall", hits.results.map((h) => h.text).join(" | ") || "(none yet)");
