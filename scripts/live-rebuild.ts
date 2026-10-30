// Fresh process, empty cache: everything shown here came back from Walrus Memory.
import { load } from "../src/lib/memory";
const r = await load(true);
console.log(r.records.length, "records from", r.source, r.error ?? "", JSON.stringify(r.state.prefs));
