"use client";

import Link from "next/link";
import { CheckCircle2, FileJson, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { mockRunResultTC001, mockStepTracesTC001 } from "@/lib/mock-data/runs";

export default function RunReportPage() {
  const result = mockRunResultTC001;
  const traces = mockStepTracesTC001;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Run report" subtitle="Trace, assertions, and run result for TC-001" />

      <main className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                  result.status === "passed"
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/15 text-rose-400"
                )}
              >
                <span className="size-1.5 rounded-full bg-current opacity-90" />
                {result.status}
              </span>
              <h1 className="text-xl font-semibold tracking-tight">{result.test_name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground font-mono">
              <span>Run: <span className="text-foreground">{result.run_id}</span></span>
              <span>Browser: <span className="text-foreground">chromium</span></span>
              <span>Duration: <span className="text-foreground">{result.duration_s}s</span></span>
              <span>Steps: <span className="text-foreground">{result.total_steps}</span></span>
              <span>Cost: <span className="text-foreground">${result.estimated_cost_usd.toFixed(4)}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/runs/live" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
              Back to live run
            </Link>
            <Link href="/app/runs/new" className={cn(buttonVariants({ variant: "default" }), "h-9")}>
              New test configuration
            </Link>
          </div>
        </div>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Assertions</CardTitle>
            <CardDescription>
              {result.assertion_results.filter((a) => a.passed).length} / {result.assertion_results.length} passed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.assertion_results.map((ar) => (
              <div key={ar.assertion_id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                {ar.passed
                  ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                }
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{ar.type}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{ar.assertion_id}</span>
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
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base">Step Trace</CardTitle>
            <CardDescription>{result.total_steps} steps · {result.tool_call_count} tool calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {traces.map((trace) => (
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
                      {trace.total_step_latency_ms}ms
                    </span>
                  </div>
                  {trace.agent_output_text && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{trace.agent_output_text}</p>
                  )}
                  <div className="flex gap-3 text-xs text-muted-foreground font-mono">
                    <span>{trace.input_tokens}↓ {trace.output_tokens}↑ tok</span>
                    <span>${trace.estimated_cost_usd.toFixed(5)}</span>
                  </div>
                </div>
              </div>
            ))}
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
                <p className="font-mono font-medium">{result.termination_reason ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Errors</p>
                <p className="font-mono font-medium">{result.error_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Tool Calls</p>
                <p className="font-mono font-medium">{result.tool_call_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Tokens (in / out)</p>
                <p className="font-mono font-medium">
                  {result.total_input_tokens.toLocaleString()} / {result.total_output_tokens.toLocaleString()}
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
            <CardDescription>RunResult JSON</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-lg border border-border/60 bg-background/60 p-4 text-xs leading-relaxed">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
