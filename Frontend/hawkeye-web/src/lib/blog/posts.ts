export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;       // ISO date string
  readingTime: string;
  category: string;
  content: string;    // plain text / basic HTML for now; swap for MDX later
};

export const POSTS: Post[] = [
  {
    slug: "why-vision-over-selectors",
    title: "Why We Chose Vision Over Selectors",
    excerpt:
      "Traditional test frameworks break the moment a class name changes. We decided to give the agent eyes instead — here's what we learned.",
    date: "2026-05-10",
    readingTime: "5 min read",
    category: "Architecture",
    content: `
Every test automation framework we evaluated had the same failure mode: a CSS selector rotted, a data-testid got renamed, a layout shifted — and a hundred tests went red for the wrong reason.

We wanted Hawkeye to be different. Instead of selecting elements by identity, our agents observe the page the way a human QA engineer would: they take a screenshot, look at it, and decide what to do next.

## How it works

At every step the agent runs two things in parallel:

1. **A CDP screenshot** — a raw PNG of the current page state, base64-encoded and sent to the LLM as a vision message.
2. **A Playwright MCP accessibility tree** — a structured text representation of interactive elements, used to generate precise tool calls (click, type, navigate).

The LLM gets both. It reasons from the screenshot ("I can see the checkout button in the bottom-right of the viewport") and acts on the accessibility tree ("browser_click(e42)"). The visual reasoning drives intent; the accessibility tree provides the reliable handle.

## The tradeoff

Vision adds latency and cost. Each step requires a multimodal LLM call instead of a fast deterministic selector lookup. For a 20-step test that's real money.

But here's what we found: vision-driven tests are dramatically more resilient to UI changes. In our internal test suite against SauceDemo, zero tests broke across three full UI refactors that would have invalidated dozens of CSS selectors.

The economics work when you're testing critical paths — checkout, auth, onboarding — where the cost of a missed regression is orders of magnitude higher than the cost of a slightly more expensive test run.
    `.trim(),
  },
  {
    slug: "building-with-langgraph",
    title: "Building an AI Agent with LangGraph",
    excerpt:
      "LangGraph gave us a state machine that we could actually reason about. Here's how we modeled the OBSERVE → REASON → ACT loop.",
    date: "2026-05-05",
    readingTime: "7 min read",
    category: "Engineering",
    content: `
When we started building the Hawkeye agent we tried a simple ReAct loop first — system prompt, user message, tool calls, repeat. It worked for happy paths but fell apart on errors. We had no clean way to handle retries, guard rails, or the distinction between "goal complete" and "goal blocked."

LangGraph gave us the right abstraction: a directed state graph where each node is a function and edges are routing decisions.

## The graph

Our state machine has six nodes:

- **OBSERVE** — waits for page stability, takes a screenshot, reads the accessibility tree
- **REASON** — sends screenshot + tree to the LLM, gets back a reasoning trace and a tool call
- **GUARD_RAILS** — checks the proposed action against policy (no cross-domain navigation, no destructive actions outside the target)
- **ACT** — executes the tool call via Playwright MCP or custom tools
- **GOAL_CHECK** — scans the LLM output for \`<GOAL_COMPLETE>\` or \`<GOAL_BLOCKED>\` signals
- **FINALIZE** — runs assertions, saves artifacts, emits the final report

The cleanest insight from building this: putting GUARD_RAILS between REASON and ACT meant we could freely let the LLM reason without worrying about it doing something dangerous. The guard is a separate, deterministic function — no LLM involved, no hallucination risk.

## Error recovery

The ERROR_HANDLER node classifies failures and decides whether to retry (MCP reconnect, transient timeout) or terminate (fatal browser crash, max steps exceeded). Because it's a node in the graph, it can inject recovery messages into the conversation context and route back to OBSERVE — the agent literally continues from where it failed, with context about what went wrong.

This turned out to be one of the most valuable features in production. Sandbox containers occasionally hiccup. Without recovery logic, any transient error would fail the whole run.
    `.trim(),
  },
  {
    slug: "multi-llm-architecture",
    title: "How We Made Hawkeye Model-Agnostic",
    excerpt:
      "GPT-4o, Claude, Gemini, NVIDIA NIM, Ollama — the same test runs on all of them. Here's the abstraction layer that makes it work.",
    date: "2026-04-28",
    readingTime: "4 min read",
    category: "Engineering",
    content: `
One of the earliest product decisions we made: no LLM lock-in. A user should be able to run the same test with GPT-4o on Monday and switch to a local Ollama model on Tuesday without touching their test definition.

## The provider string

Every run takes a \`model\` parameter in the format \`provider:model-name\`:

- \`openrouter:openai/gpt-4o\`
- \`nvidia:moonshotai/kimi-k2.6\`
- \`ollama:llama3.2\`

A small factory function parses the prefix and returns a LangChain \`BaseChatModel\` configured for that provider. The rest of the agent doesn't know or care which model it's talking to.

## Vision capability detection

Not all models can see screenshots. We maintain an \`is_vision_capable(model)\` function that checks the provider and model name against a known list. When vision is unavailable, the OBSERVE node skips the screenshot step and sends only the accessibility tree. The test still runs — it just loses the visual reasoning layer.

This graceful degradation was important for Ollama users running smaller local models. They get a working agent, not a crash.

## Cost differences in practice

In our benchmarks, a 20-step checkout test costs roughly:
- GPT-4o: ~$0.04
- Claude Sonnet: ~$0.03
- NVIDIA Kimi K2.6: ~$0.02
- Ollama (local): $0.00

The quality difference is real — GPT-4o and Claude catch more subtle visual anomalies — but for routine regression runs, the cheaper models perform well on well-defined goals.
    `.trim(),
  },
  {
    slug: "from-script-to-agent",
    title: "From Flaky Scripts to Autonomous Agents",
    excerpt:
      "We killed our Selenium test suite and replaced it with 12 lines of YAML. Here's what the transition looked like.",
    date: "2026-04-15",
    readingTime: "6 min read",
    category: "Product",
    content: `
Our previous test setup was 340 lines of Selenium Python across 8 files. It took a junior engineer a full day to add a new test. It broke every time the design team shipped. The QA person spent more time fixing tests than writing them.

The goal with Hawkeye was to reduce a new test to a declaration: what page, what goal, what counts as success.

## A test case in YAML

\`\`\`yaml
id: TC-002b
name: SauceDemo — add item to cart
target:
  url: https://www.saucedemo.com
  browser: chromium
goal: |
  Log in as standard_user, add "Sauce Labs Backpack" to the cart,
  and verify the cart badge shows 1 item.
assertions:
  - type: content
    check: Cart badge displays "1"
constraints:
  max_steps: 20
  timeout_seconds: 120
\`\`\`

That's it. The agent figures out the rest — how to find the login form, what credentials to use (from the vault), how to navigate the product list, what "cart badge" means visually.

## What we gave up

Determinism. A scripted test does exactly the same thing every run. An agent might click a slightly different element, take a different path through the UI, use different reasoning. For some teams that's unacceptable.

Our answer: the *assertions* are deterministic. We don't care how the agent gets to the cart — we care that the cart badge shows "1". The goal and assertions define correctness; the agent defines the path.

## What we gained

Resilience and speed. When the design team moved the login button from the center of the page to the top-right corner, our Selenium tests broke. Our Hawkeye test didn't — the agent saw the button in its new position and clicked it.

New test time dropped from ~4 hours to ~15 minutes, mostly spent writing the goal statement and assertions clearly.
    `.trim(),
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
