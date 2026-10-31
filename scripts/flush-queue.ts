// Sends any writes left in the restart-safe queue and waits until Walrus confirms them.
import { flush, load, unsaved } from "../src/lib/memory";
await flush();
for (let i = 0; i < 40 && unsaved(); i++) {
  await new Promise((r) => setTimeout(r, 6000));
  await flush();
}
console.log("unsaved", unsaved(), "| records", (await load(true)).records.length);
