"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FileJson, Film, ImageIcon, XCircle } from "lucide-react";
import { useState } from "react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRun, useRunTraces } from "@/lib/api/hooks";
import { type RunStatus } from "@/lib/api/client";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

type ArtifactMeta = {
  name: string;
  type: string;
  url: string;
  size_bytes: number;
  step?: number;
  assertion_id?: string;
};

function ScreenshotGallery({ screenshots }: { screenshots: ArtifactMeta[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {screenshots.map((s) => (
          <button
            key={s.name}
            onClick={() => setLightbox(`${API_URL}${s.url}`)}
            className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/30 hover:border-primary/50 transition-colors"
          >
            <img
              src={`${API_URL}${s.url}`}
              alt={`Step ${s.step}`}
              className="h-24 w-40 object-cover object-top"
              loading="lazy"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-mono">
              #{s.step}
            </span>
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Screenshot" className="max-h-[90vh] max-w-[90vw] rounded-lg border border-border" />
        </div>
      )}
    </>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  const cfg: Record<RunStatus, { label: string; className: string }> = {
    queued:   { label: "Queued",    className: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
    running:  { label: "Running",   className: "border-amber-500/30 bg-amber-500/15 text-amber-400" },
    passed:   { label: "Passed",    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" },
    failed:   { label: "Failed",    className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    errored:  { label: "Errored",   className: "border-rose-500/30 bg-rose-500/15 text-rose-400" },
    timed_out:{ label: "Timed out", className: "border-orange-500/30 bg-orange-500/15 text-orange-400" },
    blocked:  { label: "Blocked",   className: "border-violet-500/30 bg-violet-500/15 text-violet-400" },
    cancelled:{ label: "Cancelled", className: "border-slate-500/30 bg-slate-500/15 text-slate-400" },
  };
  const c = cfg[status] ?? cfg.errored;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${c.className}`}>
      <span className="size-1.5 rounded-full bg-current opacity-90" />
      {c.label}
    </span>
  );
}

export default function RunReportPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("id");

  const { data: run, loading: runLoading, error: runError } = useRun(runId);
  const { data: traces, loading: tracesLoading } = useRunTraces(runId);

  if (!runId) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Run report" subtitle="No run selected" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No run ID in URL.{" "}
            <Link href="/app/dashboard" className="text-primary underline">Go to dashboard</Link>.
          </p>
        </main>
      </div>
    );
  }

  if (runLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Run report" subtitle={runId} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading report…</p>
        </main>
      </div>
    );
  }

  if (runError || !run) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Run report" subtitle={runId} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-rose-400">{runError ?? "Run not found"}</p>
        </main>
      </div>
    );
  }

  const assertions = run.assertion_results ?? [];
  const passedCount = assertions.filter((a) => a.passed).length;
  const manifest: ArtifactMeta[] = (run as any).artifact_manifest ?? [];
  const screenshots = manifest.filter((a) => a.type === "screenshot").sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const reportArtifact = manifest.find((a) => a.name === "report.html");
  const videoArtifact = manifest.find((a) => a.name === "video.mp4");
  const traceArtifact = manifest.find((a) => a.name === "trace.json");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Run report" subtitle={`${run.test_name ?? runId} · ${run.status}`} />

      <main className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusPill status={run.status} />
              <h1 className="text-xl font-semibold tracking-tight">{run.test_name ?? runId}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground font-mono">
              <span>Run: <span className="text-foreground">{run.run_id}</span></span>
              <span>Duration: <span className="text-foreground">{run.duration_s != null ? `${run.duration_s}s` : "—"}</span></span>
              <span>Steps: <span className="text-foreground">{run.total_steps ?? "—"}</span></span>
              <span>Cost: <span className="text-foreground">{run.estimated_cost_usd != null ? `$${run.estimated_cost_usd.toFixed(4)}` : "—"}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {reportArtifact && (
              <a
                href={`${API_URL}${reportArtifact.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2")}
              >
                <Download className="size-3.5" />
                HTML Report
              </a>
            )}
            {videoArtifact && (
              <a
                href={`${API_URL}${videoArtifact.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2")}
              >
                <Film className="size-3.5" />
                Video
              </a>
            )}
            {traceArtifact && (
              <a
                href={`${API_URL}${traceArtifact.url}`}
                download={`trace-${runId}.json`}
                className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2")}
              >
                <FileJson className="size-3.5" />
                Trace JSON
              </a>
            )}
            <Link href={`/app/runs/live?id=${runId}`} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
              Back to live
            </Link>
            <Link href="/app/runs/new" className={cn(buttonVariants({ variant: "default" }), "h-9")}>
              New test
            </Link>
          </div>
        </div>

        {screenshots.length > 0 && (
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="size-4 text-primary" />
                Screenshots
              </CardTitle>
              <CardDescription>{screenshots.length} step screenshots</CardDescription>
            </CardHeader>
            <CardContent>
              <ScreenshotGallery screenshots={screenshots} />
            </CardContent>
          </Card>
        )}

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Assertions</CardTitle>
            <CardDescription>
              {passedCount} / {assertions.length} passed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assertions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assertions defined for this run.</p>
            ) : (
              assertions.map((ar) => (
                <div key={ar.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                  {ar.passed
                    ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                    : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                  }
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">{ar.type}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{ar.id}</span>
                      <Badge
                        variant={ar.passed ? "secondary" : "destructive"}
                        className="text-[10px] uppercase ml-auto"
                      >
                        {ar.status}
                      </Badge>
                    </div>
                    <div className="font-medium">{ar.description}</div>
                    {ar.details && (
                      <div className="text-xs text-muted-foreground">{ar.details}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Step Trace</CardTitle>
            <CardDescription>
              {tracesLoading ? "Loading traces…" : `${traces?.length ?? 0} steps · ${run.tool_call_count ?? 0} tool calls`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tracesLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 rounded-lg border border-border/60 bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : (traces ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No step traces available yet.</p>
            ) : (
              (traces ?? []).map((trace) => (
                <div key={trace.step_number} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                  <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 mt-0.5">
                    #{trace.step_number}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {trace.tool_name && (
                        <span className="font-mono text-xs font-semibold text-primary">{trace.tool_name}</span>
                      )}
                      {trace.tool_source && (
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">{trace.tool_source}</Badge>
                      )}
                      {trace.checkpoint_completed && trace.checkpoint_id && (
                        <Badge variant="secondary" className="text-[10px]">
                          ✓ {trace.checkpoint_id}
                        </Badge>
                      )}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {trace.total_step_latency_ms || (trace.llm_latency_ms + trace.tool_execution_latency_ms)}ms
                      </span>
                    </div>
                    {trace.page_url && (
                      <p className="text-xs text-muted-foreground truncate">{trace.page_url}</p>
                    )}
                    {trace.agent_output_text && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{trace.agent_output_text}</p>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground font-mono">
                      <span>{trace.input_tokens}↓ {trace.output_tokens}↑ tok</span>
                      <span>${trace.estimated_cost_usd.toFixed(5)}</span>
                    </div>
                    {trace.screenshot_b64 && (
                      <img
                        src={`data:image/png;base64,${trace.screenshot_b64}`}
                        alt={`Step ${trace.step_number} screenshot`}
                        className="mt-1 max-h-40 rounded border border-border/60 object-contain"
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Run Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Termination</p>
                <p className="font-mono font-medium">{run.termination_reason ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Errors</p>
                <p className="font-mono font-medium">{run.error_count ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Tool Calls</p>
                <p className="font-mono font-medium">{run.tool_call_count ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Tokens (in / out)</p>
                <p className="font-mono font-medium">
                  {run.total_input_tokens != null
                    ? `${run.total_input_tokens.toLocaleString()} / ${(run.total_output_tokens ?? 0).toLocaleString()}`
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4 text-primary" aria-hidden />
              Raw run result
            </CardTitle>
            <CardDescription>RunResponse JSON</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-lg border border-border/60 bg-background/60 p-4 text-xs leading-relaxed">
              {JSON.stringify(run, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
