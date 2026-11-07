// Landing page copy. Numbers in the dashboard mock are illustrative but kept consistent with each other.

export const ROTATING = [
  { name: "Claude", logo: "claude" },
  { name: "Codex", logo: "openai" },
  { name: "Cursor", logo: "cursor" },
  { name: "Copilot", logo: "githubcopilot" },
];

export const STORIES = [
  { tag: "Family", photo: "family", alt: "A woman reading her phone by a sunlit window", ask: "Send Mum her usual on Sunday.", rule: "50 to Mum, learned from three payments. A new amount waits for you." },
  { tag: "Café", photo: "cafe", alt: "A woman paying with her phone, takeaway coffee in hand", ask: "Get me a flat white on the way in.", rule: "A 3-a-day food line. The fourth coffee asks first." },
  { tag: "Subscriptions", photo: "subscriptions", alt: "A couple watching TV on the sofa in the evening", ask: "Keep Streamly paid, and tell me if it goes up.", rule: "12 a month on its line. A price rise is a question, not a charge." },
  { tag: "Gym", photo: "gym", alt: "A man resting with his phone between sets", ask: "Pay the gym like last month.", rule: "Up from 30 to 35, so it asks once and remembers your answer." },
  { tag: "Household", photo: "groceries", alt: "A family unpacking groceries in their kitchen", ask: "Reorder our staples from the usual shop.", rule: "One shop on the list, 30 a day, nothing anywhere else." },
  { tag: "Friends", photo: "dinner", alt: "Friends sharing dinner by a fireplace", ask: "Send Kofi my half of dinner.", rule: "Two Kofis in memory? It asks which one before anything moves." },
  { tag: "Travel", photo: "travel", alt: "A woman on a train platform checking her phone", ask: "Book the cheapest train under 80.", rule: "Inside its travel line it pays alone. Above it, your signature." },
  { tag: "Compute", photo: "studio", alt: "A laptop and desk lamp in a dim studio", ask: "Top up my API credits when they run low.", rule: "One provider, 25 a day, and a minute between top-ups." },
  { tag: "Street food", photo: "street", alt: "A man ordering from a food truck", ask: "Pay the food truck from my lunch line.", rule: "The truck asks with a 402. The agent answers from your allowance." },
];

export const STEPS = [
  { n: "01", cube: "solid", title: "It earns a line.", body: "Usual starts at 20 of 100 with no spending power. Clean payments raise its score, and it asks you for credit like a borrower." },
  { n: "02", cube: "nested", title: "The agent gets one key.", body: "Created on your device and never read out. It can spend inside its allowances and nothing else." },
  { n: "03", cube: "grid", title: "Every payment is checked.", body: "A Sui allowance caps it on-chain before any USDC moves. Above it, Usual waits for your signature." },
  { n: "04", cube: "broken", title: "Say “that was wrong”.", body: "The score halves, the line stops at once, and one signature cuts it on-chain." },
] as const;

export const CLIENTS = [
  { name: "Claude", logo: "claude" },
  { name: "ChatGPT", logo: "openai" },
  { name: "Codex", logo: "openai" },
  { name: "Cursor", logo: "cursor" },
  { name: "GitHub Copilot", logo: "githubcopilot" },
  { name: "Gemini CLI", logo: "googlegemini" },
  { name: "Windsurf", logo: "windsurf" },
  { name: "Zed", logo: "zedindustries" },
  { name: "Cline", logo: "cline" },
  { name: "Raycast", logo: "raycast" },
  { name: "Sui", logo: "sui" },
  { name: "USDC by Circle", logo: "circle" },
];

export const FAQ = [
  { q: "What is Usual?", a: "A wallet that learns how you talk about money, and lets your AI agent pay inside credit lines you approve. Say who and how much, see exactly what it understood, and it pays." },
  { q: "Who holds the money?", a: "You do. It stays in your own wallet. Usual's agent key can only spend through Sui allowances you signed, and the server only builds transactions, so a breach can't spend." },
  { q: "What stops an agent from overspending?", a: "The chain. Each credit line is a native Sui allowance with a periodic limit. The agent key is the spender and cannot exceed it, whatever a prompt tells it." },
  { q: "What happens above the limit?", a: "The payment waits for you. You see who, how much, to whom and why, then sign it or let it go. A first payment, or one far above normal, asks even inside a line." },
  { q: "What does Usual remember?", a: "People, usual amounts, subscriptions and limits, each as a memory in your own Walrus account. Revoke Usual's key from Settings and it forgets: “Who's Mum?”" },
  { q: "Is it live?", a: "On Sui testnet today. Connect a wallet and Usual gives you test dollars, so nothing you try costs real money. Memory runs on Walrus mainnet." },
];
