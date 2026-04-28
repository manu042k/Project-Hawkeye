import type { ProjectSummary } from "@/lib/project/store";

/** Global tier: available projects for Project Selector (UI-flow Phase 1). */
export const demoProjects: ProjectSummary[] = [
  { id: "proj-acme", name: "Acme Web", environment: "production", lastRunOk: true },
  { id: "proj-north", name: "Northwind API", environment: "staging", lastRunOk: false },
  { id: "proj-local", name: "Dev sandbox", environment: "local", lastRunOk: null },
];

/** Rich cards for project hub (Jira/Azure-style board). */
export type DemoProjectCard = ProjectSummary & {
  key: string;
  summary: string;
  updatedLabel: string;
  members: number;
  openIssues: number;
  starred?: boolean;
};

export const demoProjectCards: DemoProjectCard[] = [
  {
    id: "proj-acme",
    name: "Acme Web",
    environment: "production",
    lastRunOk: true,
    key: "AW",
    summary: "E2E + visual regression for storefront and checkout.",
    updatedLabel: "Updated 2h ago",
    members: 8,
    openIssues: 3,
    starred: true,
  },
  {
    id: "proj-north",
    name: "Northwind API",
    environment: "staging",
    lastRunOk: false,
    key: "NW",
    summary: "Contract tests and MCP-assisted API exploration.",
    updatedLabel: "Updated 1d ago",
    members: 5,
    openIssues: 12,
  },
  {
    id: "proj-local",
    name: "Dev sandbox",
    environment: "local",
    lastRunOk: null,
    key: "DEV",
    summary: "Scratch space for engineers — no scheduled runs.",
    updatedLabel: "Never updated",
    members: 2,
    openIssues: 0,
  },
];
