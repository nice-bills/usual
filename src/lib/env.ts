// Server-only config. Mock mode runs with no keys at all.
export const MOCK = process.env.USUAL_MOCK === "1" || !process.env.TATUM_API_KEY;

export const env = {
  tatumKey: process.env.TATUM_API_KEY ?? "",
  tatumGrpc: process.env.TATUM_SUI_GRPC_URL ?? "sui-testnet-grpc.gateway.tatum.io:443",
  network: (process.env.SUI_NETWORK ?? "testnet") as "testnet" | "devnet" | "mainnet",
  memwalAccount: process.env.MEMWAL_ACCOUNT_ID ?? "",
  memwalKey: process.env.MEMWAL_PRIVATE_KEY ?? "",
  memwalUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
  memwalNamespace: process.env.MEMWAL_NAMESPACE ?? "usual",
  agentKey: process.env.AGENT_SUI_PRIVATE_KEY ?? "",
  usdc: process.env.USDC_TYPE ?? "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  // Display symbol for the payment coin: USDC on testnet/mainnet, TUSD (our devnet test dollar) on devnet.
  symbol: process.env.CURRENCY_SYMBOL ?? "USDC",
  // Shrinks seeded history, limits and café prices to fit faucet-sized balances (0.05: Mum's usual is 2.50).
  scale: MOCK ? 1 : Number(process.env.DEMO_SCALE ?? 1),
  cafe: process.env.CAFE_RECIPIENT_ADDRESS ?? "",
  owner: process.env.OWNER_ADDRESS ?? "",
  ownerKey: process.env.OWNER_SUI_PRIVATE_KEY ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? process.env.AGENT_SUI_PRIVATE_KEY ?? "dev",
  // Any OpenAI-compatible endpoint (Groq, Hugging Face router). Empty key => rule parser only.
  llmUrl: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  llmKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "openai/gpt-oss-120b",
};

export const USDC_DECIMALS = 6;
