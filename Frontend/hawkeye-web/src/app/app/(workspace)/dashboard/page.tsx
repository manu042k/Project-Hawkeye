"use client";

import { useMemo, useState } from "react";
import { MoreVertical, Plus, Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRunModal } from "@/components/app/new-run-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useProjectStore } from "@/lib/project/store";
import { useRuns, useDeleteRun } from "@/lib/api/hooks";
import { type RunStatus, type RunSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";
// Link import removed — "New test run" now opens NewRunModal

function StatusPill({ status }: { status: RunStatus }) {
  const cfg = useMemo<{ label: string; className: string }>(() => {
    switch (status) {
      case "passed":
        return { label: "Passed",    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" };
      case "failed":
        return { label: "Failed",    className: "border-rose-500/30 bg-rose-500/15 text-rose-400" };
      case "running":
        return { label: "Running",   className: "border-amber-500/30 bg-amber-500/15 text-amber-400" };
      case "errored":
        return { label: "Errored",   className: "border-rose-500/30 bg-rose-500/15 text-rose-400" };
      case "timed_out":
        return { label: "Timed out", className: "border-orange-500/30 bg-orange-500/15 text-orange-400" };
      case "blocked":
        return { label: "Blocked",   className: "border-violet-500/30 bg-violet-500/15 text-violet-400" };
      default:
        return { label: status,      className: "border-border/60 bg-muted/30 text-muted-foreground" };
    }
  }, [status]);

  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${cfg.className}`}>
      <span className="size-1.5 rounded-full bg-current opacity-90" />
      {cfg.label}
    </span>
  );
}

function formatDuration(s: number | null) {
  if (s == null) return "—";
  return `${s.toFixed(1)}s`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

export default function DashboardPage() {
  const project = useProjectStore((s) => s.currentProject);
  const [activityFilter, setActivityFilter] = useState("");
  const { data: runs, loading, error } = useRuns();
  const { deleteRun } = useDeleteRun();
  const [runModalOpen, setRunModalOpen] = useState(false);

  const metrics = useMemo(() => {
    if (!runs) return null;
    const total = runs.length;
    const passed = runs.filter((r) => r.status === "passed").length;
    const active = runs.filter((r) => r.status === "running" || r.status === "queued").length;
    const passRate = total > 0 ? `${Math.round((passed / total) * 100)}%` : "—";
    return [
      { label: "Total Runs", value: String(total), delta: `${passed} passed`, tone: "primary" as const },
      { label: "Pass Rate", value: passRate, delta: `${passed} / ${total}`, tone: "success" as const },
      { label: "Active Runs", value: String(active), delta: active > 0 ? "In progress" : "Idle", tone: "warning" as const },
    ];
  }, [runs]);

  const filteredActivity = useMemo(() => {
    const q = activityFilter.trim().toLowerCase();
    const list = runs ?? [];
    if (!q) return list;
    return list.filter(
      (row) =>
        row.run_id.toLowerCase().includes(q) ||
        (row.test_name ?? "").toLowerCase().includes(q)
    );
  }, [activityFilter, runs]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Project dashboard"
        subtitle={project ? `${project.name} · ${project.environment}` : "Runs, activity, and shortcuts"}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <div className="flex justify-end">
            <Button onClick={() => setRunModalOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New test run
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              Failed to load runs: {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {(metrics ?? [
              { label: "Total Runs", value: "—", delta: loading ? "Loading…" : "No data", tone: "primary" as const },
              { label: "Pass Rate", value: "—", delta: loading ? "Loading…" : "No data", tone: "success" as const },
              { label: "Active Runs", value: "—", delta: loading ? "Loading…" : "Idle", tone: "warning" as const },
            ]).map((m) => {
              const tone =
                m.tone === "success"
                  ? "text-emerald-400"
                  : m.tone === "warning"
                    ? "text-amber-400"
                    : "text-foreground";
              return (
                <Card key={m.label} className="border-border/60 bg-card/60">
                  <CardHeader className="pb-2">
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                  </CardHeader>
                  <CardContent className="flex items-baseline gap-3">
                    <div className={`text-3xl font-semibold tracking-tight ${tone}`}>{m.value}</div>
                    <div className="text-xs font-medium text-muted-foreground">{m.delta}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    placeholder="Filter by name or run ID..."
                    className="pl-9"
                    value={activityFilter}
                    onChange={(e) => setActivityFilter(e.target.value)}
                    aria-label="Filter recent activity"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Steps</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                          Loading runs…
                        </TableCell>
                      </TableRow>
                    ) : filteredActivity.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                          {activityFilter ? "No runs match your filter." : "No runs yet. Start a new test run."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredActivity.map((row: RunSummary) => (
                        <TableRow key={row.run_id}>
                          <TableCell>
                            <StatusPill status={row.status} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.run_id}</TableCell>
                          <TableCell className="font-medium">{row.test_name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{row.total_steps ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {row.estimated_cost_usd != null ? `$${row.estimated_cost_usd.toFixed(4)}` : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{formatDuration(row.duration_s)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(row.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                aria-label="Row actions"
                                className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                              >
                                <MoreVertical className="size-4" aria-hidden="true" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setRunModalOpen(true)}>
                                  Re-run
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => window.location.href = `/app/runs/live?id=${row.run_id}`}>
                                  {row.status === "running" ? "Watch live" : "View report"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => deleteRun(row.run_id)}
                                >
                                  Cancel / Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <NewRunModal open={runModalOpen} onClose={() => setRunModalOpen(false)} />
    </div>
  );
}
