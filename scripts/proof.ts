// README proof: memory count + blob IDs in the owner's Walrus Memory account.
import { proof } from "../src/lib/memory";
import { env } from "../src/lib/env";

const p = await proof();
console.log(`account ${env.memwalAccount}\nnamespace ${env.memwalNamespace}\nmemories ${p.count}`);
for (const b of p.blobs.slice(0, 20)) console.log(`  ${b}`);
