// Exits once a Walrus Memory write lands. Probes every 5 minutes, for up to 3 hours.
import { MemWal } from "@mysten-incubation/memwal";
import { env } from "../src/lib/env";

const m = MemWal.create({ key: env.memwalKey, accountId: env.memwalAccount, serverUrl: env.memwalUrl, namespace: "usual-probe" });
for (let i = 0; i < 36; i++) {
  try {
    const j = await m.remember(`Probe at ${new Date().toISOString()}.`);
    await m.waitForRememberJob(j.job_id, { timeoutMs: 120_000 });
    console.log("relayer writes are back");
    process.exit(0);
  } catch (e) {
    console.log(new Date().toISOString(), String((e as Error).message).slice(0, 90));
  }
  await new Promise((r) => setTimeout(r, 300_000));
}
process.exit(1);
