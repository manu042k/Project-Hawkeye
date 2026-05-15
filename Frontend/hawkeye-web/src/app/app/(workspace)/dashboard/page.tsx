"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FlaskConical, Search, Trash2, Zap } from "lucide-react";
import Link from "next/link";

import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useProjectStore } from "@/lib/project/store";
import { useRuns, useDeleteRun } from "@/lib/api/hooks";
import { type RunStatus, type RunSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const ACTIVE = new Set<RunStatus>(["queued", "running"]);
const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

function runHref(run: RunSummary): string {
  return ACTIVE.has(run.status)
    ? `/app/runs/live?id=${run.run_id}`
    : `/app/artifacts/${run.run_id}`;
}

// Deterministic muted-color avatar from a string
const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-400",
  "bg-violet-500/20 text-violet-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-indigo-500/20 text-indigo-400",
  "bg-fuchsia-500/20 text-fuchsia-400",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function UserAvatar({ actor }: { actor: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  // Reset failure state when actor changes (different row)
  useEffect(() => { setImgFailed(false); }, [actor]);

  // Try Gravatar first (email MD5 via a simple hash substitute — works for most accounts),
  // then fall back to DiceBear initials avatar which always succeeds.
  const gravatarHash = useMemo(() => {
    let h = 5381;
    const s = actor.trim().toLowerCase();
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h).toString(16).padStart(32, "0");
  }, [actor]);

  const fallbackUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(actor)}&fontSize=38&fontWeight=600&size=64`;
  const src = imgFailed ? fallbackUrl : `https://www.gravatar.com/avatar/${gravatarHash}?d=404&s=64&r=g`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={actor}
      width={32}
      height={32}
      onError={() => {
        if (!imgFailed) setImgFailed(true);
      }}
      className="size-8 shrink-0 rounded-full object-cover"
    />
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  const cfg: Record<RunStatus, { label: string; className: string }> = {
    passed:    { label: "Passed",    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
    failed:    { label: "Failed",    className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    running:   { label: "Running",   className: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
    queued:    { label: "Queued",    className: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
    errored:   { label: "Errored",   className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    timed_out: { label: "Timed out", className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
    blocked:   { label: "Blocked",   className: "border-violet-500/30 bg-violet-500/15 text-violet-400" },
    cancelled: { label: "Cancelled", className: "border-slate-500/30 bg-slate-500/10 text-slate-400" },
  };
  const c = cfg[status] ?? { label: status, className: "border-border/60 bg-muted/30 text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${c.className}`}>
      <span className={cn(
        "size-1.5 rounded-full bg-current opacity-90",
        ACTIVE.has(status) && "animate-pulse",
      )} />
      {c.label}
    </span>
  );
}

function formatDuration(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DashboardPage() {
  const project = useProjectStore((s) => s.currentProject);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "passed" | "failed">("all");
  const [page, setPage] = useState(1);
  const { data: runs, loading, error } = useRuns();
  const { deleteRun } = useDeleteRun();

  const metrics = useMemo(() => {
    if (!runs) return null;
    const total = runs.length;
    const passed = runs.filter((r) => r.status === "passed").length;
    const active = runs.filter((r) => ACTIVE.has(r.status)).length;
    const passRate = total > 0 ? `${Math.round((passed / total) * 100)}%` : "—";
    return [
      { label: "Total Runs",  value: String(total),  delta: `${passed} passed`,               tone: "primary" as const, icon: Activity },
      { label: "Pass Rate",   value: passRate,       delta: `${passed} / ${total}`,            tone: "success" as const, icon: CheckCircle2 },
      { label: "Active Runs", value: String(active), delta: active > 0 ? "In progress" : "Idle", tone: "warning" as const, icon: Zap },
    ];
  }, [runs]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = runs ?? [];
    if (statusFilter === "active")  list = list.filter((r) => ACTIVE.has(r.status));
    else if (statusFilter === "passed") list = list.filter((r) => r.status === "passed");
    else if (statusFilter === "failed") list = list.filter((r) => r.status === "failed" || r.status === "errored" || r.status === "blocked");
    if (ql) list = list.filter((r) => r.run_id.toLowerCase().includes(ql) || (r.test_name ?? "").toLowerCase().includes(ql));
    return list;
  }, [q, statusFilter, runs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleQ(val: string) { setQ(val); setPage(1); }
  function handleStatus(val: typeof statusFilter) { setStatusFilter(val); setPage(1); }

  function handleView(e: React.MouseEvent, run: RunSummary) {
    e.stopPropagation();
    router.push(runHref(run));
  }

  function handleDelete(e: React.MouseEvent, runId: string) {
    e.stopPropagation();
    deleteRun(runId);
  }

  const METRIC_TONE: Record<string, string> = {
    success: "text-emerald-400",
    warning: "text-amber-400",
    primary: "text-foreground",
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Project dashboard"
        subtitle={project ? `${project.name} · ${project.environment}` : "Runs, activity, and shortcuts"}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-8">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              Failed to load runs: {error}
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Action card — first */}
            <Link href="/app/test-cases/new" className="block h-full">
              <Card className="group h-full cursor-pointer border-dashed border-border/60 bg-card/40 transition-all hover:border-primary/50 hover:bg-card/70">
                <CardContent className="flex items-center gap-4 px-5 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/60 transition-colors group-hover:bg-primary/20">
                    <FlaskConical className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">New test case</p>
                    <p className="text-xs text-muted-foreground">Create &amp; configure</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {(metrics ?? [
              { label: "Total Runs",  value: "—", delta: loading ? "Loading…" : "No data", tone: "primary" as const, icon: Activity },
              { label: "Pass Rate",   value: "—", delta: loading ? "Loading…" : "No data", tone: "success" as const, icon: CheckCircle2 },
              { label: "Active Runs", value: "—", delta: loading ? "Loading…" : "Idle",    tone: "warning" as const, icon: Zap },
            ]).map((m) => {
              const Icon = m.icon;
              const iconBg: Record<string, string> = {
                primary: "bg-foreground/5 text-foreground",
                success: "bg-emerald-500/10 text-emerald-400",
                warning: "bg-amber-500/10 text-amber-400",
              };
              return (
                <Card key={m.label} className="border-border/60 bg-card/60">
                  <CardContent className="flex items-center gap-4 px-5 py-3">
                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/60 ${iconBg[m.tone]}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-xl font-semibold tracking-tight ${METRIC_TONE[m.tone]}`}>{m.value}</span>
                        <span className="text-xs text-muted-foreground">{m.delta}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent Activity */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-col gap-0 pb-0">
              <div className="flex flex-row items-center justify-between gap-4 pb-3">
                <div className="flex gap-1">
                  {(["all", "active", "passed", "failed"] as const).map((f) => {
                    const labels = { all: "All", active: "Active", passed: "Passed", failed: "Failed" };
                    const counts = {
                      all:    (runs ?? []).length,
                      active: (runs ?? []).filter((r) => ACTIVE.has(r.status)).length,
                      passed: (runs ?? []).filter((r) => r.status === "passed").length,
                      failed: (runs ?? []).filter((r) => r.status === "failed" || r.status === "errored" || r.status === "blocked").length,
                    };
                    const isActive = statusFilter === f;
                    return (
                      <button
                        key={f}
                        onClick={() => handleStatus(f)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                        )}
                      >
                        {labels[f]}
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                          isActive ? "bg-background text-foreground" : "bg-muted/60 text-muted-foreground",
                        )}>
                          {counts[f]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter by name or run ID…"
                    className="pl-9 h-8 text-sm"
                    value={q}
                    onChange={(e) => handleQ(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28 pl-6">Status</TableHead>
                      <TableHead>Test Case</TableHead>
                      <TableHead className="hidden md:table-cell">Duration</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                      <TableHead className="pr-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={5} className="pl-6">
                            <div className="h-8 w-full rounded bg-muted/30 animate-pulse" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : pageRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                          {q ? "No runs match your filter." : "No runs yet. Start a new test run."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageRows.map((row: RunSummary) => {
                        const name = row.test_name ?? row.run_id.slice(0, 8);
                        const actor = row.triggered_by ?? "";
                        const href = runHref(row);
                        return (
                          <TableRow
                            key={row.run_id}
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => router.push(href)}
                          >
                            <TableCell className="pl-6">
                              <StatusPill status={row.status} />
                            </TableCell>

                            {/* Test Case column: avatar + name + run ID */}
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Tooltip>
                                  <TooltipTrigger className="shrink-0 cursor-default">
                                    {actor ? (
                                      <UserAvatar actor={actor} />
                                    ) : (
                                      <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted/60 text-[11px] font-bold text-muted-foreground">
                                        ?
                                      </span>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="text-xs">
                                    {actor ? (
                                      <span>Run by <span className="font-medium">{actor}</span></span>
                                    ) : (
                                      <span className="text-muted-foreground">No trigger info</span>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{name}</p>
                                  <p className="font-mono text-[10px] text-muted-foreground">{row.run_id.slice(0, 8)}</p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="hidden font-mono text-sm text-muted-foreground md:table-cell">
                              {formatDuration(row.duration_s)}
                            </TableCell>

                            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                              {formatDate(row.created_at)}
                            </TableCell>

                            <TableCell className="pr-6 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => handleView(e, row)}
                                  title={ACTIVE.has(row.status) ? "Watch live" : "View artifact"}
                                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                >
                                  <ExternalLink className="size-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleDelete(e, row.run_id)}
                                  title="Delete run"
                                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination — always shown when there are rows */}
              {!loading && filtered.length > 0 && (
                <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    {filtered.length <= PAGE_SIZE
                      ? `${filtered.length} run${filtered.length !== 1 ? "s" : ""}`
                      : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length} runs`}
                  </p>
                  <div className="flex items-center gap-1">
                    {totalPages > 1 && <>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded text-xs transition-colors",
                              safePage === p
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                            )}
                          >
                            {p}
                          </button>
                        ),
                      )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    </>
                    }
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>


    </div>
  );
}
