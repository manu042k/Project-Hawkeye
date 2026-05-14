"use client";

import Link from "next/link";
import {
  CheckCircle2, ChevronDown, ChevronRight, Clock,
  Film, ImageIcon, Printer, XCircle, Zap,
} from "lucide-react";
import { use, useState, useRef } from "react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const STATUS_CFG: Record<RunStatus, { label: string; dot: string; badge: string }> = {
  queued:    { label: "Queued",    dot: "bg-amber-400",   badge: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  running:   { label: "Running",   dot: "bg-amber-400",   badge: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  passed:    { label: "Passed",    dot: "bg-emerald-400", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  failed:    { label: "Failed",    dot: "bg-rose-400",    badge: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  errored:   { label: "Errored",   dot: "bg-rose-400",    badge: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  timed_out: { label: "Timed out", dot: "bg-orange-400",  badge: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  blocked:   { label: "Blocked",   dot: "bg-violet-400",  badge: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
  cancelled: { label: "Cancelled", dot: "bg-slate-400",   badge: "border-slate-500/30 bg-slate-500/10 text-slate-400" },
};

function StatusBadge({ status }: { status: RunStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.errored;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider", c.badge)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-5 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ScreenshotGallery({ screenshots }: { screenshots: ArtifactMeta[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {screenshots.map((s) => (
          <button
            key={s.name}
            onClick={() => setLightbox(`${API_URL}${s.url}`)}
            className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/30 hover:border-primary/50 transition-colors"
            style={{ aspectRatio: "16/9" }}
          >
            <img
              src={`${API_URL}${s.url}`}
              alt={`Step ${s.step}`}
              className="absolute inset-0 w-full h-full object-cover object-top"
              loading="lazy"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-mono">
              Step {s.step}
            </span>
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Screenshot" className="max-h-[90vh] max-w-[90vw] rounded-xl border border-border shadow-2xl" />
        </div>
      )}
    </>
  );
}

function StepTraceItem({
  trace,
  onScreenshot,
}: {
  trace: ReturnType<typeof useRunTraces>["data"] extends (infer T)[] | null ? T : never;
  onScreenshot: (src: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isError = !trace.tool_success && !!trace.tool_error;
  const imgSrc = trace.screenshot_b64 ? `data:image/png;base64,${trace.screenshot_b64}` : null;

  return (
    <div className={cn(
      "rounded-xl border bg-card/40 overflow-hidden",
      isError ? "border-rose-500/30" : "border-border/60",
    )}>
      <div className="flex gap-4 p-4 items-start">
        {/* ── Left: step info ─────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-hidden space-y-2">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              isError ? "bg-rose-500/15 text-rose-400" : "bg-muted/60 text-muted-foreground",
            )}>
              {trace.step_number}
            </span>
            {trace.tool_name && (
              <span className="font-mono text-sm font-semibold text-primary">{trace.tool_name}</span>
            )}
            {trace.tool_source && (
              <Badge variant="outline" className="text-[10px] uppercase font-mono">{trace.tool_source}</Badge>
            )}
            {trace.checkpoint_completed && trace.checkpoint_id && (
              <Badge variant="secondary" className="text-[10px]">✓ {trace.checkpoint_id}</Badge>
            )}
            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {trace.total_step_latency_ms ?? (trace.llm_latency_ms + trace.tool_execution_latency_ms)}ms
              </span>
              <span className="flex items-center gap-1">
                <Zap className="size-3" />
                ${trace.estimated_cost_usd.toFixed(5)}
              </span>
            </div>
          </div>

          {/* URL */}
          {trace.page_url && (
            <p className="text-xs text-muted-foreground truncate font-mono">{trace.page_url}</p>
          )}

          {/* Description / agent reasoning — always visible, clamped */}
          {trace.agent_output_text && (
            <div>
              <p className={cn(
                "text-sm text-foreground/80 leading-relaxed",
                !expanded && "line-clamp-3",
              )}>
                {trace.agent_output_text}
              </p>
              {trace.agent_output_text.length > 200 && (
                <button
                  type="button"
                  className="mt-1 text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? <><ChevronDown className="size-3" /> Show less</> : <><ChevronRight className="size-3" /> Show more</>}
                </button>
              )}
            </div>
          )}

          {/* Tool error */}
          {trace.tool_error && (
            <p className="text-xs text-rose-400 font-mono">{trace.tool_error}</p>
          )}

          {/* Token breakdown */}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground font-mono pt-0.5">
            <span>{trace.input_tokens}↓ {trace.output_tokens}↑ tok</span>
            <span>LLM {trace.llm_latency_ms}ms · Tool {trace.tool_execution_latency_ms}ms</span>
          </div>
        </div>

        {/* ── Right: screenshot ───────────────────────────── */}
        {imgSrc && (
          <button
            type="button"
            onClick={() => onScreenshot(imgSrc)}
            className="shrink-0 w-36 h-24 rounded-lg overflow-hidden border border-border/60 hover:border-primary/50 transition-colors"
          >
            <img
              src={imgSrc}
              alt={`Step ${trace.step_number} screenshot`}
              className="w-full h-full object-cover object-top"
            />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ArtifactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = use(params);
  const reportRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: run, loading: runLoading, error: runError } = useRun(runId);
  const { data: traces, loading: tracesLoading } = useRunTraces(runId);

  function exportPdf() {
    window.print();
  }

  if (runLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Report" subtitle={runId} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (runError || !run) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Report" subtitle={runId} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm text-rose-400">{runError ?? "Run not found"}</p>
            <Link href="/app/artifacts" className={cn(buttonVariants({ variant: "outline" }), "h-8 text-xs")}>
              Back to Artifacts
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const assertions = run.assertion_results ?? [];
  const passedCount = assertions.filter((a) => a.passed).length;
  const manifest: ArtifactMeta[] = (run as Record<string, unknown>).artifact_manifest as ArtifactMeta[] ?? [];
  const screenshots = manifest.filter((a) => a.type === "screenshot").sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const videoArtifact = manifest.find((a) => a.name.endsWith(".mp4") || a.type === "video");
  const totalTokens = (run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Run Report" subtitle={run.test_name ?? runId} />

      <main ref={reportRef} className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-8">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={run.status} />
              {run.termination_reason && (
                <span className="text-xs text-muted-foreground font-mono">{run.termination_reason}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{run.test_name ?? runId}</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {run.run_id} · {run.created_at ? new Date(run.created_at).toLocaleString() : "—"}
              {run.triggered_by && (
                <span className="ml-2">· run by <span className="text-foreground">{run.triggered_by}</span></span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" className="gap-2" onClick={exportPdf}>
              <Printer className="size-3.5" />
              Export PDF
            </Button>
            {videoArtifact && (
              <a
                href={`${API_URL}${videoArtifact.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
              >
                <Film className="size-3.5" />
                Video
              </a>
            )}
            <Link href="/app/artifacts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              All reports
            </Link>
          </div>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Duration"
            value={run.duration_s != null ? `${run.duration_s}s` : "—"}
          />
          <KpiCard
            label="Steps"
            value={String(run.total_steps ?? "—")}
            sub={`${run.tool_call_count ?? 0} tool calls`}
          />
          <KpiCard
            label="Tokens"
            value={totalTokens > 0 ? totalTokens.toLocaleString() : "—"}
            sub={`$${(run.estimated_cost_usd ?? 0).toFixed(4)} est. cost`}
          />
          <KpiCard
            label="Assertions"
            value={assertions.length > 0 ? `${passedCount}/${assertions.length}` : "—"}
            sub={assertions.length > 0 ? (passedCount === assertions.length ? "all passed" : `${assertions.length - passedCount} failed`) : "none defined"}
          />
        </div>

        {/* ── Video Recording ─────────────────────────────────────────────────── */}
        {videoArtifact && (() => {
          const isFail = run.status === "failed" || run.status === "errored";
          return (
            <Card className={cn("border-border/60 bg-card/50", isFail && "border-rose-500/40")}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Film className="size-4 text-primary" />
                  Session Recording
                  {isFail && (
                    <span className="ml-2 text-xs font-normal text-rose-400">Run failed — review the recording</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  src={`${API_URL}${videoArtifact.url}`}
                  controls
                  className="w-full rounded-lg border border-border/40 bg-black"
                  style={{ maxHeight: "400px" }}
                />
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Execution Timeline (steps + inline screenshots) ─────────────────── */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="size-4 text-primary" />
              Execution Timeline
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {tracesLoading ? "Loading…" : `${traces?.length ?? 0} steps · ${screenshots.length} screenshots`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tracesLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
              ))
            ) : (traces ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No step traces available.</p>
            ) : (
              (traces ?? []).map((trace) => (
                <StepTraceItem key={trace.step_number} trace={trace} onScreenshot={setLightbox} />
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Assertions ──────────────────────────────────────────────────────── */}
        {assertions.length > 0 && (
          <Card className="border-border/60 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Assertions
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {passedCount}/{assertions.length} passed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {assertions.map((ar) => (
                <div key={ar.id} className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm",
                  ar.passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5",
                )}>
                  {ar.passed
                    ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
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
                    <p className="font-medium">{ar.description}</p>
                    {ar.details && <p className="text-xs text-muted-foreground">{ar.details}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Run meta ────────────────────────────────────────────────────────── */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Run Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-sm">
              {[
                { label: "Run ID",        value: run.run_id },
                { label: "Termination",   value: run.termination_reason ?? "—" },
                { label: "Errors",        value: String(run.error_count ?? "—") },
                { label: "Tool calls",    value: String(run.tool_call_count ?? "—") },
                { label: "Input tokens",  value: run.total_input_tokens?.toLocaleString() ?? "—" },
                { label: "Output tokens", value: run.total_output_tokens?.toLocaleString() ?? "—" },
                { label: "Est. cost",     value: run.estimated_cost_usd != null ? `$${run.estimated_cost_usd.toFixed(4)}` : "—" },
                { label: "Duration",      value: run.duration_s != null ? `${run.duration_s}s` : "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
                  <dd className="font-mono font-medium truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Screenshot" className="max-h-[90vh] max-w-[90vw] rounded-xl border border-border shadow-2xl" />
        </div>
      )}
      </main>
    </div>
  );
}
