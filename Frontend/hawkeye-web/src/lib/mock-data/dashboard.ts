export type ActivityStatus = "passed" | "failed" | "running";

export type RecentActivity = {
  id: string;
  status: ActivityStatus;
  testName: string;
  targetUrl: string;
  duration: string;
  dateLabel: string;
};

export const dashboardMetrics = [
  { label: "Total Test Runs", value: "1,204", delta: "+12%", tone: "primary" as const },
  { label: "Global Pass Rate", value: "94.2%", delta: "+0.8%", tone: "success" as const },
  { label: "Active MCP Sessions", value: "2", delta: "LIVE", tone: "warning" as const },
];

export const recentActivity: RecentActivity[] = [
  {
    id: "r1",
    status: "passed",
    testName: "E2E Checkout Flow",
    targetUrl: "/api/v1/checkout/process",
    duration: "1m 12s",
    dateLabel: "2 mins ago",
  },
  {
    id: "r2",
    status: "failed",
    testName: "User Authentication - OAuth",
    targetUrl: "/auth/google/callback",
    duration: "45s",
    dateLabel: "15 mins ago",
  },
  {
    id: "r3",
    status: "running",
    testName: "Data Synchronization Job",
    targetUrl: "/worker/sync/postgres",
    duration: "2m 04s",
    dateLabel: "Just now",
  },
  {
    id: "r4",
    status: "passed",
    testName: "Profile Image Upload",
    targetUrl: "/api/user/avatar/upload",
    duration: "14s",
    dateLabel: "1 hour ago",
  },
];

