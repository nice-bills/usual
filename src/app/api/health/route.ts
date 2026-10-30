import { env, MOCK } from "@/lib/env";
import { json } from "@/lib/http";

/** Which integrations this deployment runs live. No secrets. */
export function GET() {
  return json({
    mock: MOCK,
    network: env.network,
    tatum: !!env.tatumKey,
    walrusMemory: !!(env.memwalAccount && env.memwalKey),
    llm: env.llmKey ? env.llmModel : "rules",
    cafe: !!env.cafe,
  });
}
