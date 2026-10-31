import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export default {
  // agent.* steps use the same free Groq key as the app's parser (LLM_API_KEY); the core tests need no model.
  agents: {
    default: {
      model: createOpenAICompatible({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.LLM_API_KEY,
        supportsStructuredOutputs: true,
      }).chatModel('openai/gpt-oss-120b'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3200',
      // Mock mode: no keys, in-memory ledger and memory, so the run is deterministic.
      command: process.env.APP_URL ? undefined : { executable: 'corepack', args: ['pnpm', 'dev:mock', '--port', '3200'], log: '.e2e/logs/app.log' },
    },
  }],
} satisfies E2EConfig;
