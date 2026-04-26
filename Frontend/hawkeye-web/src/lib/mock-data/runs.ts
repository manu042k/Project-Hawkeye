export type ExecutionLogLine = {
  ts: string;
  level: "system" | "reasoning" | "action";
  message: string;
};

export const initialExecutionLog: ExecutionLogLine[] = [
  { ts: "14:02:11", level: "system", message: "[System] Launching Chrome MCP..." },
  { ts: "14:02:12", level: "system", message: "[System] Injecting observation scripts..." },
  { ts: "14:02:14", level: "reasoning", message: "[Reasoning] Page loaded. Identifying search bar to find product." },
  { ts: "14:02:15", level: "action", message: '[Action] -> fill_element("input[name=\\"q\\"]", "wireless headphones")' },
  { ts: "14:02:16", level: "action", message: '[Action] -> press_key("Enter")' },
  { ts: "14:02:18", level: "reasoning", message: "[Reasoning] Search results loaded. Selecting first prominent result." },
  { ts: "14:02:19", level: "action", message: '[Action] -> click_element(".product-card:first-child a")' },
  {
    ts: "14:02:22",
    level: "reasoning",
    message: "[Reasoning] Product details loaded. Need to click the checkout button to proceed with guest flow.",
  },
];

export const nextLogLines: ExecutionLogLine[] = [
  { ts: "14:02:24", level: "action", message: '[Action] -> click_element("button[data-test=\\"checkout\\"]")' },
  { ts: "14:02:25", level: "reasoning", message: "[Reasoning] Checkout page opened. Verifying totals and shipping form." },
  { ts: "14:02:27", level: "action", message: '[Action] -> fill_element("#email", "guest@example.com")' },
  { ts: "14:02:29", level: "reasoning", message: "[Reasoning] Filling shipping address fields." },
  { ts: "14:02:32", level: "action", message: '[Action] -> click_element("button[type=\\"submit\\"]")' },
  { ts: "14:02:34", level: "reasoning", message: "[Reasoning] Payment step loaded. Awaiting manual card entry." },
];

