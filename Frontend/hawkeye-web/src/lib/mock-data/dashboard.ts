export type ActivityStatus = "passed" | "failed" | "running" | "errored" | "timed_out" | "blocked";

export type RecentActivity = {
  id: string;
  status: ActivityStatus;
  runId: string;
  testName: string;
  targetUrl: string;
  browser: string;
  duration: string;
  dateLabel: string;
};

export const dashboardMetrics = [
  { label: "Phase 1 Tests",   value: "2",   delta: "TC-001 · TC-002", tone: "primary" as const },
  { label: "Smoke Pass Rate", value: "50%", delta: "1 / 2 passed",    tone: "success" as const },
  { label: "Active Runs",     value: "0",   delta: "Idle",            tone: "warning" as const },
];

export const recentActivity: RecentActivity[] = [
  {
    id: "r1",
    runId: "run-wiki-001",
    status: "passed",
    testName: "Wikipedia: search and scroll through AI article",
    targetUrl: "https://www.wikipedia.org",
    browser: "chromium",
    duration: "14.3s",
    dateLabel: "Today, 10:14",
  },
  {
    id: "r2",
    runId: "run-amz-001",
    status: "failed",
    testName: "Amazon: find product, add to cart, verify cart",
    targetUrl: "https://www.amazon.com",
    browser: "chromium",
    duration: "48.1s",
    dateLabel: "Today, 09:52",
  },
];
