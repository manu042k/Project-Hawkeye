"use client";

import { Suspense, useMemo, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Monitor, Plus, Terminal as TerminalIcon, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRunTraceStream, useRun, useDeleteRun, useRuns } from "@/lib/api/hooks";
import { NewRunModal } from "@/components/app/new-run-modal";
import { type TraceEvent, type RunStatus, type RunSummary } from "@/lib/api/client";

const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

type LogLine = { ts: string; level: "system" | "reasoning" | "action" | "error"; message: string };

function eventToLogLine(event: TraceEvent): LogLine | null {
  const ts = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const d = event.data;
  switch (event.event_type) {
    case "run_started": return { ts, level: "system", message: "Run started" };
    case "step_start": return { ts, level: "system", message: `Step ${(d as { step_number?: number }).step_number ?? "?"} started` };
    case "observe": return { ts, level: "system", message: `Observe — ${(d as { url?: string }).url ?? ""}` };
    case "reason": return {
      ts, level: "reasoning",
      message: `Reason — ${(d as { input_tokens?: number }).input_tokens ?? 0} in / ${(d as { output_tokens?: number }).output_tokens ?? 0} out tokens, $${((d as { cost_usd?: number }).cost_usd ?? 0).toFixed(4)}`,
    };
    case "act": return {
      ts, level: "action",
      message: `Act — ${(d as { tool_name?: string }).tool_name ?? "?"} → ${(d as { success?: boolean }).success ? "OK" : "ERR"}`,
    };
    case "error": return { ts, level: "error", message: `Error — ${(d as { message?: string }).message ?? ""}` };
    case "complete": return { ts, level: "system", message: `Complete — ${(d as { status?: string }).status ?? ""}` };
    default: return null;
  }
}

function StatusBadge({ status }: { status: RunStatus | null }) {
  if (!status) return null;
  const cfg: Record<RunStatus, { label: string; className: string }> = {
    queued:    { label: "Queued",      className: "border-amber-500/25 bg-amber-500/10 text-amber-400" },
    running:   { label: "In progress", className: "border-amber-500/25 bg-amber-500/10 text-amber-400" },
    passed:    { label: "Passed",      className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
    failed:    { label: "Failed",      className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    errored:   { label: "Errored",     className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    timed_out: { label: "Timed out",   className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
    blocked:   { label: "Blocked",     className: "border-violet-500/30 bg-violet-500/15 text-violet-400" },
    cancelled: { label: "Cancelled",   className: "border-slate-500/30 bg-slate-500/15 text-slate-400" },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${c.className}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
}

function statusDotClass(status: RunStatus): string {
  switch (status) {
    case "running":
    case "queued":
      return "bg-amber-400";
    case "passed":
      return "bg-emerald-400";
    case "failed":
    case "errored":
      return "bg-rose-400";
    default:
      return "bg-muted-foreground";
  }
}

function isActive(status: RunStatus): boolean {
  return status === "running" || status === "queued";
}

function formatElapsed(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDuration(s: number | null): string {
  if (s == null) return "";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}

// ---- Run detail panel (extracted from original page) ----

function RunDetailPanel({ runId }: { runId: string }) {
  const { events, liveStatus } = useRunTraceStream(runId);
  const { data: run } = useRun(runId);
  const { deleteRun } = useDeleteRun();

  const logLines = useMemo(
    () => events.flatMap((e) => { const l = eventToLogLine(e); return l ? [l] : []; }),
    [events],
  );

  const stepCount = useMemo(
    () => events.filter((e) => e.event_type === "step_start").length,
    [events],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [logLines.length]);

  const status = liveStatus ?? (run?.status ?? null);
  const isDone = status ? TERMINAL.has(status) : false;
  const rawNovncUrl = run?.novnc_url ?? null;
  const novncUrl = rawNovncUrl
    ? `${rawNovncUrl}${rawNovncUrl.includes("?") ? "&" : "?"}resize=scale&autoconnect=1`
    : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground/90">Test runs</span>
            <span className="mx-2 text-border">/</span>
            <span className="font-mono">{runId}</span>
          </p>
          <StatusBadge status={status} />
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardContent className="py-5">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground font-mono">{stepCount}</span>
                {run?.total_steps ? ` / ${run.total_steps} steps` : " steps"}
              </span>
              {run?.estimated_cost_usd != null && (
                <span className="text-muted-foreground">
                  {"Cost "}
                  <span className="font-semibold text-foreground font-mono">${run.estimated_cost_usd.toFixed(4)}</span>
                </span>
              )}
              {run?.total_input_tokens != null && (
                <span className="text-muted-foreground">
                  {"Tokens "}
                  <span className="font-semibold text-foreground font-mono">
                    {((run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0)).toLocaleString()}
                  </span>
                </span>
              )}
              {isDone && (
                <Link
                  href={`/app/runs/report?id=${runId}`}
                  className={cn(buttonVariants({ variant: "default", size: "sm" }), "ml-auto")}
                >
                  <CheckCircle2 className="size-4" />
                  View Report
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="flex flex-col overflow-hidden border-border/60 bg-card/60" style={{ height: 560 }}>
            <CardHeader className="flex flex-row items-center gap-4 border-b border-border/60 shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <TerminalIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                AI Execution Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-background/30 p-0 overflow-hidden" style={{ height: 500 }}>
              <ScrollArea className="h-full p-5 font-mono text-sm">
                <div className="space-y-3">
                  {logLines.length === 0 && !isDone && (
                    <div className="text-muted-foreground italic">Connecting to run…</div>
                  )}
                  {logLines.map((l, idx) => {
                    const tone =
                      l.level === "action" ? "text-primary" :
                      l.level === "reasoning" ? "text-foreground" :
                      l.level === "error" ? "text-rose-400" :
                      "text-muted-foreground";
                    return (
                      <div key={idx} className="flex gap-4">
                        <span className="w-20 shrink-0 text-muted-foreground">{l.ts}</span>
                        <span className={tone}>{l.message}</span>
                      </div>
                    );
                  })}
                  {!isDone && (
                    <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                      <span className="h-4 w-1.5 bg-primary/70 animate-pulse" />
                      <span className="italic">Awaiting next action…</span>
                    </div>
                  )}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden border-border/60 bg-card/60" style={{ height: 560 }}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/60 shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                Browser Feed
              </CardTitle>
              {novncUrl && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">Live</Badge>}
            </CardHeader>
            <CardContent className="bg-background/30 p-0 overflow-hidden" style={{ height: 500 }}>
              {novncUrl ? (
                <iframe
                  src={novncUrl}
                  className="w-full h-full border-0 block"
                  title="Live browser feed"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div className="inline-flex size-14 items-center justify-center rounded-full bg-muted/60">
                    <Monitor className="size-7 text-muted-foreground/50" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">Live VNC stream</div>
                  <div className="text-xs text-muted-foreground/70">
                    {status === "running" ? "Awaiting sandbox URL…" : "Available during active runs"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {!isDone && (
          <div className="flex justify-end">
            <Dialog>
              <DialogTrigger
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300",
                )}
              >
                <XCircle className="size-4" aria-hidden="true" />
                Abort Test Run
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Abort this run?</DialogTitle>
                  <DialogDescription>
                    The Celery task will be cancelled and the sandbox container stopped.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="destructive" onClick={() => deleteRun(runId)}>
                    Abort run
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Run list sidebar item ----

function RunListItem({
  run,
  selected,
  onClick,
  now,
}: {
  run: RunSummary;
  selected: boolean;
  onClick: () => void;
  now: number;
}) {
  const active = isActive(run.status);
  const label = run.test_name ?? run.run_id.slice(0, 8);
  const time = active
    ? formatElapsed(run.created_at)
    : run.duration_s != null
    ? formatDuration(run.duration_s)
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
        selected
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(run.status), active && "animate-pulse")} />
      <span className="flex-1 truncate font-medium">{label}</span>
      {time && <span className="shrink-0 font-mono text-xs opacity-70">{time}</span>}
    </button>
  );
}

// ---- Inner page (uses useSearchParams) ----

function LiveExecutionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    searchParams.get("id"),
  );
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const { data: runs } = useRuns();

  // Tick every second to update elapsed times for active runs
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function selectRun(id: string) {
    setSelectedRunId(id);
    router.replace(`/app/runs/live?id=${id}`);
  }

  const sortedRuns = useMemo(() => {
    if (!runs) return [];
    const active = runs.filter((r) => isActive(r.status));
    const done = runs.filter((r) => !isActive(r.status));
    active.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    done.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return [...active, ...done];
  }, [runs]);

  const hasActive = sortedRuns.some((r) => isActive(r.status));
  const activeRuns = sortedRuns.filter((r) => isActive(r.status));
  const doneRuns = sortedRuns.filter((r) => !isActive(r.status));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Live execution" subtitle="Executions &amp; live browser feed" />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border/60 bg-card/40">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <span className="text-sm font-semibold">Executions</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setNewRunOpen(true)}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {activeRuns.length > 0 && (
                <>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Active
                  </p>
                  {activeRuns.map((r) => (
                    <RunListItem
                      key={r.run_id}
                      run={r}
                      selected={r.run_id === selectedRunId}
                      onClick={() => selectRun(r.run_id)}
                      now={now}
                    />
                  ))}
                  {doneRuns.length > 0 && (
                    <div className="my-1 border-t border-border/40" />
                  )}
                </>
              )}
              {doneRuns.map((r) => (
                <RunListItem
                  key={r.run_id}
                  run={r}
                  selected={r.run_id === selectedRunId}
                  onClick={() => selectRun(r.run_id)}
                  now={now}
                />
              ))}
              {sortedRuns.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No runs yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Right panel */}
        {selectedRunId ? (
          <RunDetailPanel runId={selectedRunId} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Select a run to view details</p>
              <Button variant="outline" size="sm" onClick={() => setNewRunOpen(true)}>
                <Plus className="size-4" />
                Start a new run
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewRunModal open={newRunOpen} onClose={() => setNewRunOpen(false)} />
    </div>
  );
}

export default function LiveExecutionPage() {
  return (
    <Suspense>
      <LiveExecutionInner />
    </Suspense>
  );
}
