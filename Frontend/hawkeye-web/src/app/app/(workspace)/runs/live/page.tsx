"use client";

import { useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Monitor, Terminal as TerminalIcon, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRunTraceStream, useRun, useDeleteRun } from "@/lib/api/hooks";
import { type TraceEvent, type RunStatus } from "@/lib/api/client";

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
    queued:   { label: "Queued",     className: "border-amber-500/25 bg-amber-500/10 text-amber-400" },
    running:  { label: "In progress", className: "border-amber-500/25 bg-amber-500/10 text-amber-400" },
    passed:   { label: "Passed",     className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
    failed:   { label: "Failed",     className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    errored:  { label: "Errored",    className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    timed_out:{ label: "Timed out",  className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
    blocked:  { label: "Blocked",    className: "border-violet-500/30 bg-violet-500/15 text-violet-400" },
    cancelled:{ label: "Cancelled",  className: "border-slate-500/30 bg-slate-500/15 text-slate-400" },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${c.className}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
}

export default function LiveExecutionPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("id");

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

  if (!runId) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Live execution" subtitle="No run selected" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No run ID in URL. <Link href="/app/runs/new" className="text-primary underline">Start a new run</Link>.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Live execution" subtitle={run?.test_name ? `${run.test_name} · ${runId}` : runId} />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
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
                  <div className="text-center space-y-3">
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
                    <Button variant="destructive" onClick={() => runId && deleteRun(runId)}>
                      Abort run
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
