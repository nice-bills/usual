import { env, MOCK } from "@/lib/env";
import Usual from "../Usual";

export default function Page() {
  return <Usual health={{ mock: MOCK, network: env.network, tatum: !!env.tatumKey, walrusMemory: !!(env.memwalAccount && env.memwalKey), llm: env.llmKey ? env.llmModel : "rules" }} />;
}
