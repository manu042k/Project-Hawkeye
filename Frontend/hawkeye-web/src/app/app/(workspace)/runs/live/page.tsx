"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Monitor, MoreVertical, Terminal as TerminalIcon, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { initialExecutionLog, nextLogLines, type ExecutionLogLine } from "@/lib/mock-data/runs";

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(3);
  const [capturedLabel, setCapturedLabel] = useState("Last captured: 1.2s ago");
  const [abortOpen, setAbortOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let idx = 0;
    const t = setInterval(() => {
      setCapturedLabel((prev) => (prev.includes("ago") ? "Last captured: just now" : "Last captured: 1.2s ago"));
      setLines((cur) => {
        if (idx >= nextLogLines.length) return cur;
        const next = [...cur, nextLogLines[idx]];
        idx += 1;
        return next;
      });
    }, 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length]);

  const breadcrumbs = useMemo(
    () => [
      { label: "Test Runs", href: "/app/runs/live" },
      { label: "Run #4052" },
    ],
    []
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Checkout Flow - Guest User"
        breadcrumbs={breadcrumbs}
        rightSlot={
          <div className="hidden items-center gap-2 sm:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-400" />
              In progress
            </span>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <Card className="border-border/60 bg-card/60">
            <CardContent className="py-6">
              <div className="relative max-w-3xl">
                <div className="absolute left-0 top-4 h-0.5 w-full bg-border/60" />
                <div className="absolute left-0 top-4 h-0.5 w-[66%] bg-primary/70" />

                <div className="flex items-start justify-between">
                  {[
                    { n: 1, label: "Planning" },
                    { n: 2, label: "Navigating" },
                    { n: 3, label: "Interacting" },
                    { n: 4, label: "Verifying" },
                  ].map((s) => {
                    const done = s.n < step;
                    const active = s.n === step;
                    return (
                      <div key={s.n} className="relative flex w-24 flex-col items-center gap-2 bg-background px-2">
                        <div
                          className={
                            done
                              ? "inline-flex size-8 items-center justify-center rounded-full bg-emerald-400 text-background"
                              : active
                                ? "inline-flex size-8 items-center justify-center rounded-full border-2 border-primary bg-background"
                                : "inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground"
                          }
                        >
                          {done ? "✓" : active ? <CircleDot className="size-4 text-primary" aria-hidden="true" /> : s.n}
                        </div>
                        <div className={`text-xs font-semibold ${done ? "text-emerald-400" : active ? "text-foreground" : "text-muted-foreground"}`}>
                          {s.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                  Live Browser Feed
                </CardTitle>
                <span className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {capturedLabel}
                </span>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-center justify-center bg-background/30 p-5">
                <div className="w-full max-w-3xl">
                  <div className="flex items-center gap-2 rounded-t-lg border-x border-t border-border/60 bg-muted/40 p-2">
                    <div className="flex gap-1.5 px-2">
                      <span className="size-3 rounded-full bg-rose-500/80" />
                      <span className="size-3 rounded-full bg-amber-500/80" />
                      <span className="size-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="flex-1 rounded border border-border/60 bg-card px-3 py-1 text-center font-mono text-xs text-muted-foreground">
                      https://demo-store.testops.com/product/wh-1000xm4
                    </div>
                  </div>
                  <div className="relative aspect-video overflow-hidden rounded-b-lg border border-border/60 bg-card">
                    <Image
                      alt="E-commerce product page preview"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAcmtRa0Ei8gnHZwC89n81KP-yZTe96llMAA-7AYiUNNN1vgq-Lp_58bUxEEQYM9kIGFlGXku3usTBqbnD6-1qzlXBV6bVDkdH63F3ViSvGdFrbk6YqDUuS8Bl1jFjgENW6-WeJ0ToyNJ95iSw1gprumj1o3hdyMhPnu3may0zw5Sc7lG0yMFnGEORSc8qjfX88GSImZmo3u1AQx_rPz6NYH3PMVMedn4TS93uD3ujWMfFr-iGS7cR3VgiHMkr1hMDt9ej6LPakkW4"
                      fill
                      className="object-cover opacity-90"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-black/20" />
                    <div className="pointer-events-none absolute bottom-[20%] right-[15%] flex h-10 w-[120px] items-center justify-center rounded-lg border-2 border-primary bg-primary/10 shadow-[0_0_15px_rgba(173,198,255,0.35)]" />
                  </div>
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
                            setStep(4);
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

