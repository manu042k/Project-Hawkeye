export type ExecutionLogLine = {
  ts: string;
  level: "system" | "reasoning" | "action";
  message: string;
};

export type AssertionResult = {
  assertion_id: string;
  type: "content" | "console";
  description: string;
  passed: boolean;
  status: "passed" | "failed" | "skipped" | "error";
  details: string | null;
};

export type StepTrace = {
  step_number: number;
  timestamp: number;
  completed_at: number | null;
  checkpoint_id: string | null;
  checkpoint_completed: boolean;
  model: string;
  input_tokens: number;
  output_tokens: number;
  llm_latency_ms: number;
  tool_name: string | null;
  tool_source: "mcp" | "custom" | null;
  tool_input: Record<string, unknown> | null;
  tool_output: unknown;
  tool_success: boolean;
  tool_error: string | null;
  tool_retries: number;
  agent_output_text: string | null;
  stop_reason: string | null;
  page_url: string;
  page_title: string;
  wait_for_stable_ms: number;
  tool_execution_latency_ms: number;
  total_step_latency_ms: number;
  estimated_cost_usd: number;
};

export type RunResult = {
  run_id: string;
  test_id: string;
  test_name: string;
  status: "running" | "passed" | "failed" | "errored" | "timed_out" | "blocked";
  steps_completed: string[];
  assertion_results: AssertionResult[];
  total_steps: number;
  duration_s: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  termination_reason: string | null;
  trace_path: string | null;
  error_count: number;
  tool_call_count: number;
};

export type Checkpoint = {
  id: string;
  description: string;
  success_signal: string;
};

export const initialExecutionLog: ExecutionLogLine[] = [
  { ts: "10:14:02", level: "system",    message: "[System] Initializing Hawkeye agent for TC-001 · Wikipedia search..." },
  { ts: "10:14:03", level: "system",    message: "[System] Sandbox ready. MCP client connected on :3100." },
  { ts: "10:14:04", level: "action",    message: '[Action] -> browser_navigate({ url: "https://www.wikipedia.org" })' },
  { ts: "10:14:05", level: "reasoning", message: "[Reasoning] Page loaded. I can see the Wikipedia homepage with a prominent search box at centre." },
  { ts: "10:14:06", level: "action",    message: '[Action] -> browser_type({ selector: "input#searchInput", text: "artificial intelligence" })' },
  { ts: "10:14:07", level: "system",    message: "[System] Checkpoint S1 candidate — verifying success signal." },
  { ts: "10:14:08", level: "action",    message: '[Action] -> browser_press_key({ key: "Enter" })' },
];

export const nextLogLines: ExecutionLogLine[] = [
  { ts: "10:14:09", level: "system",    message: "[System] Checkpoint S1 completed." },
  { ts: "10:14:10", level: "reasoning", message: "[Reasoning] Search results loaded. 'Artificial intelligence — Wikipedia' is at the top. Clicking the article link." },
  { ts: "10:14:11", level: "action",    message: '[Action] -> browser_click({ selector: "a[title=\\"Artificial intelligence\\"]" })' },
  { ts: "10:14:13", level: "system",    message: "[System] Checkpoint S2 completed." },
  { ts: "10:14:14", level: "reasoning", message: "[Reasoning] Full article loaded with Table of Contents. Scrolling through sections now." },
  { ts: "10:14:15", level: "action",    message: '[Action] -> browser_scroll({ direction: "down", amount: 800 })' },
  { ts: "10:14:16", level: "system",    message: "[System] Checkpoint S3 completed. Running assertions..." },
  { ts: "10:14:17", level: "action",    message: '[Action] -> assert_text_present({ text: "Artificial intelligence" })' },
  { ts: "10:14:18", level: "action",    message: '[Action] -> get_console_errors({ level: "error", max_count: 3 })' },
  { ts: "10:14:19", level: "system",    message: "[System] All assertions passed. Finalizing run." },
];

export const mockCheckpointsTC001: Checkpoint[] = [
  { id: "S1", description: "Locate the search box and type 'artificial intelligence'", success_signal: "Search results page or the AI article is visible" },
  { id: "S2", description: "Open the 'Artificial intelligence' article", success_signal: "Full article page with title and sections is displayed" },
  { id: "S3", description: "Scroll through the article content", success_signal: "Multiple sections (History, Applications, etc.) are visible after scrolling" },
];

const T0 = 1746691642; // 2026-05-08 10:14:02 UTC

export const mockStepTracesTC001: StepTrace[] = [
  {
    step_number: 1, timestamp: T0, completed_at: T0 + 1.2,
    checkpoint_id: null, checkpoint_completed: false,
    model: "llama-3.3-70b-versatile", input_tokens: 842, output_tokens: 62, llm_latency_ms: 720,
    tool_name: "browser_navigate", tool_source: "mcp",
    tool_input: { url: "https://www.wikipedia.org" }, tool_output: { ok: true }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Navigating to the Wikipedia homepage to begin the search task.",
    stop_reason: "tool_use",
    page_url: "about:blank", page_title: "",
    wait_for_stable_ms: 120, tool_execution_latency_ms: 380, total_step_latency_ms: 1220,
    estimated_cost_usd: 0.000542,
  },
  {
    step_number: 2, timestamp: T0 + 1.3, completed_at: T0 + 2.8,
    checkpoint_id: null, checkpoint_completed: false,
    model: "llama-3.3-70b-versatile", input_tokens: 1240, output_tokens: 88, llm_latency_ms: 840,
    tool_name: "browser_snapshot", tool_source: "mcp",
    tool_input: {}, tool_output: { snapshot: "<omitted>" }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Page loaded. I can see the Wikipedia homepage with a prominent search box labeled 'Search Wikipedia'.",
    stop_reason: "tool_use",
    page_url: "https://www.wikipedia.org", page_title: "Wikipedia",
    wait_for_stable_ms: 210, tool_execution_latency_ms: 450, total_step_latency_ms: 1500,
    estimated_cost_usd: 0.000800,
  },
  {
    step_number: 3, timestamp: T0 + 2.9, completed_at: T0 + 5.4,
    checkpoint_id: "S1", checkpoint_completed: true,
    model: "llama-3.3-70b-versatile", input_tokens: 1890, output_tokens: 74, llm_latency_ms: 1080,
    tool_name: "browser_type", tool_source: "mcp",
    tool_input: { selector: "input#searchInput", text: "artificial intelligence" }, tool_output: { ok: true }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Typing 'artificial intelligence' into the search input box.",
    stop_reason: "tool_use",
    page_url: "https://www.wikipedia.org", page_title: "Wikipedia",
    wait_for_stable_ms: 180, tool_execution_latency_ms: 1240, total_step_latency_ms: 2500,
    estimated_cost_usd: 0.001167,
  },
  {
    step_number: 4, timestamp: T0 + 5.5, completed_at: T0 + 7.1,
    checkpoint_id: null, checkpoint_completed: false,
    model: "llama-3.3-70b-versatile", input_tokens: 1120, output_tokens: 48, llm_latency_ms: 620,
    tool_name: "browser_press_key", tool_source: "mcp",
    tool_input: { key: "Enter" }, tool_output: { ok: true }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Pressing Enter to submit the search.",
    stop_reason: "tool_use",
    page_url: "https://www.wikipedia.org", page_title: "Wikipedia",
    wait_for_stable_ms: 95, tool_execution_latency_ms: 885, total_step_latency_ms: 1600,
    estimated_cost_usd: 0.000720,
  },
  {
    step_number: 5, timestamp: T0 + 7.2, completed_at: T0 + 10.5,
    checkpoint_id: "S2", checkpoint_completed: true,
    model: "llama-3.3-70b-versatile", input_tokens: 2340, output_tokens: 92, llm_latency_ms: 1140,
    tool_name: "browser_click", tool_source: "mcp",
    tool_input: { selector: 'a[title="Artificial intelligence"]' }, tool_output: { ok: true }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Search results are displayed. 'Artificial intelligence — Wikipedia' is the top result. Clicking the article link.",
    stop_reason: "tool_use",
    page_url: "https://en.wikipedia.org/w/index.php?search=artificial+intelligence", page_title: "Search results — Wikipedia",
    wait_for_stable_ms: 310, tool_execution_latency_ms: 1860, total_step_latency_ms: 3300,
    estimated_cost_usd: 0.001489,
  },
  {
    step_number: 6, timestamp: T0 + 10.6, completed_at: T0 + 13.2,
    checkpoint_id: "S3", checkpoint_completed: true,
    model: "llama-3.3-70b-versatile", input_tokens: 2680, output_tokens: 78, llm_latency_ms: 980,
    tool_name: "browser_scroll", tool_source: "mcp",
    tool_input: { direction: "down", amount: 800 }, tool_output: { ok: true }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Article page loaded with full table of contents. Scrolling down to reveal multiple sections including History and Applications.",
    stop_reason: "tool_use",
    page_url: "https://en.wikipedia.org/wiki/Artificial_intelligence", page_title: "Artificial intelligence — Wikipedia",
    wait_for_stable_ms: 420, tool_execution_latency_ms: 1200, total_step_latency_ms: 2600,
    estimated_cost_usd: 0.001699,
  },
  {
    step_number: 7, timestamp: T0 + 13.3, completed_at: T0 + 13.8,
    checkpoint_id: null, checkpoint_completed: false,
    model: "llama-3.3-70b-versatile", input_tokens: 980, output_tokens: 44, llm_latency_ms: 410,
    tool_name: "assert_text_present", tool_source: "custom",
    tool_input: { text: "Artificial intelligence" }, tool_output: { found: true, url: "https://en.wikipedia.org/wiki/Artificial_intelligence" }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Running content assertion A1: checking that 'Artificial intelligence' text is present on the page.",
    stop_reason: "tool_use",
    page_url: "https://en.wikipedia.org/wiki/Artificial_intelligence", page_title: "Artificial intelligence — Wikipedia",
    wait_for_stable_ms: 0, tool_execution_latency_ms: 90, total_step_latency_ms: 500,
    estimated_cost_usd: 0.000621,
  },
  {
    step_number: 8, timestamp: T0 + 13.9, completed_at: T0 + 14.3,
    checkpoint_id: null, checkpoint_completed: false,
    model: "llama-3.3-70b-versatile", input_tokens: 860, output_tokens: 52, llm_latency_ms: 380,
    tool_name: "get_console_errors", tool_source: "custom",
    tool_input: { level: "error", max_count: 3, ignore_patterns: ["favicon", "analytics", "gtag"] }, tool_output: { error_count: 0, errors: [] }, tool_success: true, tool_error: null, tool_retries: 0,
    agent_output_text: "Running console assertion A2: checking for critical JS errors during navigation.",
    stop_reason: "end_turn",
    page_url: "https://en.wikipedia.org/wiki/Artificial_intelligence", page_title: "Artificial intelligence — Wikipedia",
    wait_for_stable_ms: 0, tool_execution_latency_ms: 20, total_step_latency_ms: 400,
    estimated_cost_usd: 0.000555,
  },
];

export const mockRunResultTC001: RunResult = {
  run_id: "run-wiki-001",
  test_id: "TC-001",
  test_name: "Wikipedia: search and scroll through AI article",
  status: "passed",
  steps_completed: ["S1", "S2", "S3"],
  assertion_results: [
    { assertion_id: "A1", type: "content", description: "Article title contains 'Artificial intelligence'", passed: true, status: "passed", details: "Found text on https://en.wikipedia.org/wiki/Artificial_intelligence" },
    { assertion_id: "A2", type: "console", description: "No critical JS errors during navigation", passed: true, status: "passed", details: "0 console errors found (filtered: favicon, analytics, gtag)" },
  ],
  total_steps: 8,
  duration_s: 14.3,
  total_input_tokens: 12840,
  total_output_tokens: 892,
  estimated_cost_usd: 0.0042,
  termination_reason: "goal_complete",
  trace_path: null,
  error_count: 0,
  tool_call_count: 8,
};

export const mockCheckpointsTC002: Checkpoint[] = [
  { id: "S1", description: "Locate and use the Amazon search bar to search for 'wireless bluetooth headphones'", success_signal: "Search results page is displayed with product listings" },
  { id: "S2", description: "Open any product from the search results", success_signal: "Product detail page is displayed with an 'Add to Cart' or 'Add to Shopping Cart' button" },
  { id: "S3", description: "Click the 'Add to Cart' button", success_signal: "Cart confirmation is shown, or cart counter increments, or success banner appears" },
  { id: "S4", description: "Navigate to the shopping cart", success_signal: "Cart page is displayed" },
  { id: "S5", description: "Verify the added product is in the cart", success_signal: "Cart shows at least one item matching the product added" },
];

export const mockRunResultTC002: RunResult = {
  run_id: "run-amz-001",
  test_id: "TC-002",
  test_name: "Amazon: find product, add to cart, verify cart",
  status: "failed",
  steps_completed: ["S1", "S2"],
  assertion_results: [
    { assertion_id: "A1", type: "content", description: "Cart contains at least one headphones item", passed: false, status: "failed", details: "Cart page did not load — blocked by login redirect at step 20" },
    { assertion_id: "A2", type: "content", description: "Cart shows a price or subtotal", passed: false, status: "skipped", details: "Skipped — A1 did not pass" },
    { assertion_id: "A3", type: "console", description: "No critical JS errors during the flow", passed: true, status: "passed", details: "0 console errors found (filtered: favicon, analytics, beacon, ads)" },
  ],
  total_steps: 35,
  duration_s: 48.1,
  total_input_tokens: 29400,
  total_output_tokens: 1820,
  estimated_cost_usd: 0.0121,
  termination_reason: "max_steps_reached",
  trace_path: null,
  error_count: 0,
  tool_call_count: 35,
};
