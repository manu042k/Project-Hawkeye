"use client";

import Link from "next/link";
import { CheckCircle2, FileJson, ImageIcon } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const steps = [
  { status: "passed" as const, action: "Navigate", expected: "Login form", actual: "Login form visible" },
  { status: "passed" as const, action: "Act", expected: "Submit credentials", actual: "Session cookie set" },
  { status: "passed" as const, action: "Verify", expected: "Dashboard route", actual: "200 OK" },
];

const mcpSample = {
  runId: "run_8f2a9c",
  model: "claude-3-5-sonnet",
  completedAt: new Date().toISOString(),
};

export default function RunReportPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Run report"
        subtitle="Post-mortem timeline, visual diffs, and MCP output (UI-flow Phase 2)"
      />

      <main className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Latest completed run</h1>
            <p className="mt-1 text-sm text-muted-foreground">Static demo — step array, image URLs, and raw JSON</p>
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

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Step timeline</CardTitle>
              <CardDescription>Status, action, expected, actual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-sm"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.action}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {s.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground/80">Expected:</span> {s.expected}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground/80">Actual:</span> {s.actual}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="size-4 text-primary" aria-hidden />
                Visual diff
              </CardTitle>
              <CardDescription>Baseline vs actual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-6 text-center text-xs text-muted-foreground">
                  Baseline image URL
                  <div className="mt-2 break-all font-mono text-[10px] text-foreground/80">https://cdn…/baseline.png</div>
                </div>
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-6 text-center text-xs text-muted-foreground">
                  Actual image URL
                  <div className="mt-2 break-all font-mono text-[10px] text-foreground/80">https://cdn…/actual.png</div>
                </div>
              </div>
              <Separator className="bg-border/60" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pixel diff</span>
                <span className="font-medium tabular-nums">0.04%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4 text-primary" aria-hidden />
              Raw MCP output
            </CardTitle>
            <CardDescription>JSON object structure (demo)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-lg border border-border/60 bg-background/60 p-4 text-xs leading-relaxed">
              {JSON.stringify(mcpSample, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
