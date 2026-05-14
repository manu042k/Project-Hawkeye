"use client";

import { Suspense, useMemo, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Cpu, Globe, Monitor, Plus, Terminal as TerminalIcon, User, Video, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRunTraceStream, useRun, useDeleteRun, useRuns } from "@/lib/api/hooks";
import { NewRunModal } from "@/components/app/new-run-modal";
import { type TraceEvent, type RunStatus, type RunSummary } from "@/lib/api/client";

const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

type LogLevel = "step" | "observe" | "reasoning" | "action" | "action_err" | "error" | "complete" | "system";
type LogLine = { ts: string; level: LogLevel; tag: string; message: string };

function eventToLogLine(event: TraceEvent): LogLine | null {
  const ts = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const d = event.data;
  switch (event.event_type) {
    case "run_started":
      return { ts, level: "system", tag: "RUN", message: "Started" };
    case "step_start":
      return { ts, level: "step", tag: `STEP ${(d as { step_number?: number }).step_number ?? "?"}`, message: "" };
    case "observe":
      return { ts, level: "observe", tag: "OBS", message: (d as { url?: string }).url ?? "" };
    case "reason": {
      const rd = d as { input_tokens?: number; output_tokens?: number; cost_usd?: number };
      return {
        ts, level: "reasoning", tag: "LLM",
        message: `${rd.input_tokens ?? 0} in / ${rd.output_tokens ?? 0} out  ·  $${(rd.cost_usd ?? 0).toFixed(4)}`,
      };
    }
    case "act": {
      const ad = d as { tool_name?: string; success?: boolean };
      const ok = ad.success !== false;
      return {
        ts, level: ok ? "action" : "action_err", tag: "ACT",
        message: `${ad.tool_name ?? "?"} → ${ok ? "OK" : "ERR"}`,
      };
    }
    case "error":
      return { ts, level: "error", tag: "ERR", message: (d as { message?: string }).message ?? "" };
    case "complete": {
      const status = (d as { status?: string }).status ?? "";
      return { ts, level: "complete", tag: "DONE", message: status };
    }
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
  const { data: run, refetch: refetchRun } = useRun(runId);
  const { deleteRun } = useDeleteRun();

  // When the WS signals completion, immediately re-fetch the run so we get
  // the authoritative final status (passed/failed/errored) from the server.
  useEffect(() => {
    if (liveStatus && TERMINAL.has(liveStatus)) refetchRun();
  }, [liveStatus, refetchRun]);

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

  // Once the HTTP-polled run reaches a terminal state, trust it over the WS signal.
  const status = (run?.status && TERMINAL.has(run.status))
    ? run.status
    : (liveStatus ?? run?.status ?? null);
  const isDone = status ? TERMINAL.has(status) : false;
  const rawNovncUrl = run?.novnc_url ?? null;
  const novncUrl = rawNovncUrl
    ? `${rawNovncUrl}${rawNovncUrl.includes("?") ? "&" : "?"}resize=scale&autoconnect=1`
    : null;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">

      {/* ── Stats bar ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border/60 bg-card/40 px-5 py-3">
        <span className="font-mono text-xs text-muted-foreground">{runId}</span>
        <div className="h-3.5 w-px bg-border/60" />
        <StatusBadge status={status} />
        <div className="h-3.5 w-px bg-border/60" />
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground font-mono">{stepCount}</span>
          {run?.total_steps ? `/${run.total_steps}` : ""} steps
        </span>
        {run?.estimated_cost_usd != null && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground font-mono">${run.estimated_cost_usd.toFixed(4)}</span> cost
          </span>
        )}
        {run?.total_input_tokens != null && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground font-mono">
              {((run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0)).toLocaleString()}
            </span> tokens
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDone ? (
            <Link
              href={`/app/artifacts/${runId}`}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-7 gap-1.5 text-xs")}
            >
              <CheckCircle2 className="size-3.5" />
              View Report
            </Link>
          ) : (
            <Dialog>
              <DialogTrigger
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-7 text-xs border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300",
                )}
              >
                <XCircle className="size-3.5" />
                Abort
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
          )}
        </div>
      </div>

      {/* ── Main split: logs 40% | browser 60% ─────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Logs — terminal style */}
        <div className="flex w-[40%] shrink-0 flex-col border-r border-border/60 min-h-0">
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/60 px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-500/70" />
              <span className="size-2.5 rounded-full bg-amber-500/70" />
              <span className="size-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <div className="flex-1 flex items-center justify-center gap-1.5">
              <TerminalIcon className="size-3 text-muted-foreground/60" />
              <span className="text-[11px] font-medium text-muted-foreground/70 tracking-wide">agent · execution log</span>
            </div>
          </div>

          {/* Terminal body */}
          <ScrollArea className="flex-1 min-h-0 bg-muted/20">
            <div className="p-3 font-mono text-[11px] leading-relaxed space-y-0.5">
              {logLines.length === 0 && !isDone && (
                <div className="text-muted-foreground/40 italic px-1">connecting…</div>
              )}
              {logLines.map((l, idx) => {
                const tagCfg: Record<LogLevel, { chip: string; msg: string }> = {
                  step:       { chip: "bg-muted text-muted-foreground",
                                msg:  "text-foreground/70 font-semibold" },
                  observe:    { chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                                msg:  "text-sky-700 dark:text-sky-400/80" },
                  reasoning:  { chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                msg:  "text-amber-800 dark:text-amber-200/70" },
                  action:     { chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                                msg:  "text-emerald-700 dark:text-emerald-400" },
                  action_err: { chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                                msg:  "text-rose-600 dark:text-rose-400" },
                  error:      { chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold",
                                msg:  "text-rose-700 dark:text-rose-300" },
                  complete:   { chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                                msg:  "text-violet-700 dark:text-violet-300" },
                  system:     { chip: "bg-muted text-muted-foreground/70",
                                msg:  "text-muted-foreground/70" },
                };
                const cfg = tagCfg[l.level];

                if (l.level === "step") {
                  return (
                    <div key={idx} className="flex items-center gap-2 py-1.5 mt-1">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${cfg.chip}`}>
                        {l.tag}
                      </span>
                      <span className="flex-1 h-px bg-border/60" />
                      <span className="text-muted-foreground/40 text-[10px]">{l.ts}</span>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="flex items-start gap-2 px-1 py-0.5 rounded hover:bg-muted/40 transition-colors">
                    <span className="shrink-0 text-muted-foreground/40 w-[4.2rem] pt-0.5 tabular-nums">{l.ts}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider leading-none ${cfg.chip}`}>
                      {l.tag}
                    </span>
                    <span className={`${cfg.msg} break-all`}>{l.message}</span>
                  </div>
                );
              })}

              {!isDone && (
                <div className="flex items-center gap-2 px-1 py-1 text-muted-foreground/40">
                  <span className="text-muted-foreground/50">$</span>
                  <span className="h-3.5 w-1.5 bg-muted-foreground/50 animate-pulse rounded-sm" />
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Config + Browser feed */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">

          {/* ── Config list ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border/60 bg-card/30 px-5 py-4 space-y-3">

            {/* Section label */}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Run Configuration
            </p>

            {/* Key-value rows */}
            <div className="space-y-0 divide-y divide-border/40 rounded-lg border border-border/50 overflow-hidden text-sm">

              <div className="flex items-center gap-3 px-3 py-2.5 bg-background/50">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Test case</span>
                <span className="font-medium text-foreground truncate">{run?.test_name ?? <span className="text-muted-foreground/40 italic">loading…</span>}</span>
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 bg-background/30">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Browser</span>
                <span className="inline-flex items-center gap-1.5 text-foreground/80">
                  <Globe className="size-3 text-muted-foreground/50" />
                  <span className="capitalize text-sm">{run?.browser_used ?? "chromium"}</span>
                </span>
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 bg-background/50">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Recording</span>
                {run?.recording ? (
                  <span className="inline-flex items-center gap-1.5 text-rose-400">
                    <Video className="size-3" />
                    <span className="text-sm font-medium">On</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground/60">
                    <Video className="size-3" />
                    <span className="text-sm">Off</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 bg-background/30">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Viewport</span>
                <span className="font-mono text-sm text-foreground/80">
                  {run?.viewport
                    ? `${run.viewport.width} × ${run.viewport.height}${run.viewport.device_scale_factor && run.viewport.device_scale_factor !== 1 ? ` @${run.viewport.device_scale_factor}x` : ""}`
                    : "—"}
                </span>
              </div>

              <div className="flex items-start gap-3 px-3 py-2.5 bg-background/50">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60 pt-0.5">Model</span>
                <span className="font-mono text-xs text-foreground/70 break-all leading-relaxed">
                  {run?.model_used ?? "—"}
                </span>
              </div>

              {run?.max_steps_override != null && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-background/50">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Max steps</span>
                  <span className="font-mono text-sm text-foreground/80">{run.max_steps_override}</span>
                </div>
              )}

              {run?.timeout_override != null && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-background/30">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Timeout</span>
                  <span className="font-mono text-sm text-foreground/80">{run.timeout_override}s</span>
                </div>
              )}

              <div className="flex items-center gap-3 px-3 py-2.5 bg-background/50">
                <span className="w-28 shrink-0 text-xs text-muted-foreground/60">Triggered by</span>
                <span className="inline-flex items-center gap-1.5 text-foreground/70">
                  <User className="size-3 text-muted-foreground/50" />
                  <span className="text-sm truncate">{run?.triggered_by ?? "—"}</span>
                </span>
              </div>

            </div>
          </div>

          {/* ── Browser feed ─────────────────────────────────────────────── */}
          <div className="shrink-0">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Monitor className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Browser Feed</span>
              </div>
              {novncUrl && (
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="p-3">
              {novncUrl ? (
                <BrowserFeedFrame url={novncUrl} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <div className="inline-flex size-12 items-center justify-center rounded-full bg-muted/30">
                    <Monitor className="size-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground/50">
                    {status === "running" ? "Awaiting sandbox…" : "Available during active runs"}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

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

  const activeRuns = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter((r) => isActive(r.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [runs]);

  // Auto-select the first ACTIVE run when the page loads without an id in the URL
  useEffect(() => {
    if (selectedRunId || !runs) return;
    const first = activeRuns[0];
    if (first) selectRun(first.run_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  const completedCount = runs ? runs.filter((r) => !isActive(r.status)).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Live"
        subtitle={
          activeRuns.length > 0
            ? `${activeRuns.length} active run${activeRuns.length !== 1 ? "s" : ""}`
            : "No active runs"
        }
      />

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
              {activeRuns.length === 0 ? (
                <div className="px-3 py-6 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">No active runs</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Start one from Test Cases
                  </p>
                </div>
              ) : (
                activeRuns.map((r) => (
                  <RunListItem
                    key={r.run_id}
                    run={r}
                    selected={r.run_id === selectedRunId}
                    onClick={() => selectRun(r.run_id)}
                    now={now}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {completedCount > 0 && (
            <>
              <Separator />
              <Link
                href="/app/artifacts"
                className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {completedCount} completed run{completedCount !== 1 ? "s" : ""} in Artifacts →
              </Link>
            </>
          )}
        </aside>

        {/* Right panel */}
        {selectedRunId ? (
          <RunDetailPanel runId={selectedRunId} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Select a run to view its trace</p>
              <p className="text-xs text-muted-foreground/60">Pick one from the left panel or start a new run</p>
              <Button variant="outline" size="sm" onClick={() => setNewRunOpen(true)}>
                <Plus className="size-4" />
                Start a run
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewRunModal open={newRunOpen} onClose={() => setNewRunOpen(false)} />
    </div>
  );
}

const BROWSER_W = 1280;
const BROWSER_H = 720;
const ASPECT = BROWSER_H / BROWSER_W; // 0.5625 (16:9)

function BrowserFeedFrame({ url }: { url: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const scale = w / BROWSER_W;
      setHeight(w * ASPECT);
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.style.width = `${BROWSER_W}px`;
      iframe.style.height = `${BROWSER_H}px`;
      iframe.style.transform = `scale(${scale})`;
      iframe.style.transformOrigin = "top left";
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    // Container is exactly as tall as the scaled iframe — no black void
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg" style={{ height }}>
      <iframe
        ref={iframeRef}
        src={url}
        title="Live browser feed"
        style={{ position: "absolute", top: 0, left: 0, border: "none" }}
      />
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
