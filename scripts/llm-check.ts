// Free LLM parser check: phrases the rules don't know go to the model.
import { parseLLM } from "../src/lib/parse";
for (const t of ["could you wire fifteen bucks over to my mum", "how much cash have I got left", "I want to stop paying for that streaming thing"]) {
  console.log(JSON.stringify(t), "->", JSON.stringify(await parseLLM(t, { contacts: ["Mum", "Gym", "Streamly"], asking: null })));
}
