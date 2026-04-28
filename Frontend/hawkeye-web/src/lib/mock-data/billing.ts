export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Member";
  initials?: string;
  avatarUrl?: string;
};

export const teamMembers: TeamMember[] = [
  { id: "u1", name: "Alex Mitchell", email: "alex@techflow.pro", role: "Owner", initials: "AM" },
  {
    id: "u2",
    name: "Sarah Jenkins",
    email: "sarah@techflow.pro",
    role: "Admin",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCUyulDBwVQnPAH6RAlKHaNzx2qgu5Ey6lBHLWISMXF-oY9aF7NSQBzthXWsPSLP9zgX79HzBnxDYzCw-bw3r5jk67ppQKJWNdrbCNGyMPQw1eK3yFwnuMDGlxxLtwmzZ9v9ugh7hdogny_y3O4Kqn7dUkl6rZ7Ckd5baePokUC59unFm2luu3pvbBhxYOSzwFmyeU0Zjx3C_fG44v7oVc2s_GdlPI5BJSHSb5or1umBRORFfk1itVBheFjbCBw7nuZFEXJsFIgFGM",
  },
];

export const subscription = {
  plan: "Enterprise",
  priceMonthly: 249,
  usage: { used: 8420, limit: 10000 },
  nextBillingDate: "Oct 1, 2023",
};

/** Per-dimension meters for the billing Usage section (static demo). */
export type UsageMeter = {
  id: string;
  label: string;
  description: string;
  used: number;
  limit: number;
  unit: string;
};

export const usagePeriodLabel = "Current billing period · Sep 1 – Sep 30, 2025";

export const usageMeters: UsageMeter[] = [
  {
    id: "runs",
    label: "Test runs",
    description: "Executed runs across all projects in your org.",
    used: 8420,
    limit: 10000,
    unit: "runs",
  },
  {
    id: "vault",
    label: "Vault reads",
    description: "Secret and credential lookups from The Vault.",
    used: 12400,
    limit: 50000,
    unit: "reads",
  },
  {
    id: "api",
    label: "API requests",
    description: "Authenticated Hawkeye API calls (runs, webhooks, CI).",
    used: 890000,
    limit: 1000000,
    unit: "req",
  },
  {
    id: "storage",
    label: "Artifact storage",
    description: "Screenshots, traces, and reports retained this period.",
    used: 38.2,
    limit: 100,
    unit: "GB",
  },
];

