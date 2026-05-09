"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Monitor, MoreVertical, Terminal as TerminalIcon, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { initialExecutionLog, nextLogLines, mockCheckpointsTC001, type ExecutionLogLine } from "@/lib/mock-data/runs";

function LogLine({ line }: { line: ExecutionLogLine }) {
  const tone = line.level === "action" ? "text-primary" : line.level === "reasoning" ? "text-foreground" : "text-muted-foreground";
  const weight = line.level === "action" ? "font-medium" : "font-normal";
  return (
    <div className="flex gap-4">
      <span className="w-16 shrink-0 text-muted-foreground">{line.ts}</span>
      <span className={`${tone} ${weight}`}>{line.message}</span>
    </div>
  );
}

export default function LiveExecutionPage() {
  const [lines, setLines] = useState<ExecutionLogLine[]>(initialExecutionLog);
  const [cpIdx, setCpIdx] = useState(0);
  const [abortOpen, setAbortOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let idx = 0;
    const t = setInterval(() => {
      setLines((cur) => {
        if (idx >= nextLogLines.length) return cur;
        const next = [...cur, nextLogLines[idx]];
        // S1 completes at line 0 ("Checkpoint S1 completed")
        if (idx === 0) setCpIdx(1);
        // S2 completes at line 3 ("Checkpoint S2 completed")
        if (idx === 3) setCpIdx(2);
        // S3 completes at line 6 ("Checkpoint S3 completed")
        if (idx === 6) setCpIdx(3);
        idx += 1;
        return next;
      });
    }, 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Live execution" subtitle="TC-001 · Wikipedia · Run run-wiki-001" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground/90">Test runs</span>
              <span className="mx-2 text-border">/</span>
              run-wiki-001
            </p>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-400" />
              In progress
            </span>
          </div>

          <Card className="border-border/60 bg-card/60">
            <CardContent className="py-5">
              <div className="flex flex-wrap items-center gap-6 mb-5 px-1 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground font-mono">{Math.min(lines.length, 20)}</span>
                  {" / 20 steps"}
                </span>
                <span className="text-muted-foreground">
                  {"Cost "}
                  <span className="font-semibold text-foreground font-mono">$0.004</span>
                </span>
                <span className="text-muted-foreground">
                  {"Tokens "}
                  <span className="font-semibold text-foreground font-mono">13,732</span>
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {mockCheckpointsTC001.map((cp, idx) => {
                  const done = idx < cpIdx;
                  const active = idx === cpIdx;
                  return (
                    <div
                      key={cp.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm",
                        active ? "bg-primary/8 border border-primary/20" : done ? "bg-card/40" : "opacity-50"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 shrink-0 size-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                          done
                            ? "bg-emerald-500 text-background"
                            : active
                              ? "border-2 border-primary text-primary"
                              : "border border-border/60 text-muted-foreground"
                        )}
                      >
                        {done ? <CheckCircle2 className="size-3" /> : cp.id}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn("font-medium", done ? "text-emerald-400" : active ? "text-foreground" : "text-muted-foreground")}>
                          {cp.description}
                        </div>
                        {active && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{cp.success_signal}</div>
                        )}
                      </div>
                      {done && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">done</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid min-h-[520px] grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="flex flex-col overflow-hidden border-border/60 bg-card/60">
              <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/60">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TerminalIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  AI Execution Logs
                </CardTitle>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreVertical className="size-4" aria-hidden="true" />
                </Button>
              </CardHeader>
              <CardContent className="flex-1 bg-background/30 p-0">
                <ScrollArea className="h-[420px] p-5 font-mono text-sm">
                  <div className="space-y-3">
                    {lines.map((l, idx) => (
                      <LogLine key={`${l.ts}-${idx}`} line={l} />
                    ))}
                    <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                      <span className="h-4 w-1.5 bg-primary/70 animate-pulse" />
                      <span className="italic">Awaiting next action...</span>
                    </div>
                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="flex flex-col overflow-hidden border-border/60 bg-card/60">
              <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/60">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                  Browser Feed
                </CardTitle>
                <Badge variant="outline" className="text-xs text-muted-foreground">Phase 3</Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-center justify-center bg-background/30 p-8 min-h-[420px]">
                <div className="text-center space-y-3">
                  <div className="inline-flex size-14 items-center justify-center rounded-full bg-muted/60">
                    <Monitor className="size-7 text-muted-foreground/50" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">Live VNC stream</div>
                  <div className="text-xs text-muted-foreground/70">Available in Phase 3</div>
                </div>

                <div className="mt-auto self-end pt-5">
                  <Dialog open={abortOpen} onOpenChange={setAbortOpen}>
                    <DialogTrigger
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      )}
                    >
                      <XCircle className="size-4" aria-hidden="true" />
                      Abort Test Run
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Abort this run?</DialogTitle>
                        <DialogDescription>
                          This is a static UI demo. Aborting will stop the simulated log stream for this page only.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAbortOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setAbortOpen(false);
                            setCpIdx(mockCheckpointsTC001.length);
                          }}
                        >
                          Abort run
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
