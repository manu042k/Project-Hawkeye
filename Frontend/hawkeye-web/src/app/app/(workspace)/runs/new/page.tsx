"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link as LinkIcon, Play, Settings2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mockCheckpointsTC001, mockCheckpointsTC002, type Checkpoint } from "@/lib/mock-data/runs";

type Preset = {
  url: string;
  browser: "chromium" | "firefox" | "webkit";
  goal: string;
  maxSteps: number;
  timeout: number;
  checkpoints: Checkpoint[];
};

const TEST_CASE_PRESETS: Record<string, Preset> = {
  "TC-001": {
    url: "https://www.wikipedia.org",
    browser: "chromium",
    goal: "Starting from the Wikipedia homepage, search for 'artificial intelligence', open the article, and scroll through multiple sections.",
    maxSteps: 20,
    timeout: 600,
    checkpoints: mockCheckpointsTC001,
  },
  "TC-002": {
    url: "https://www.amazon.com",
    browser: "chromium",
    goal: "Starting from the Amazon homepage, search for 'wireless bluetooth headphones', open any product listing, add the product to the cart, navigate to the cart, and verify the item is present in the cart.",
    maxSteps: 35,
    timeout: 480,
    checkpoints: mockCheckpointsTC002,
  },
};

export default function NewRunPage() {
  const [targetUrl, setTargetUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [environment, setEnvironment] = useState("Staging");
  const [selectedTestCase, setSelectedTestCase] = useState<string>("custom");
  const [browser, setBrowser] = useState<"chromium" | "firefox" | "webkit">("chromium");
  const [maxSteps, setMaxSteps] = useState(20);
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);

  useEffect(() => {
    if (selectedTestCase === "custom") return;
    const p = TEST_CASE_PRESETS[selectedTestCase];
    if (!p) return;
    setTargetUrl(p.url);
    setBrowser(p.browser);
    setNotes(p.goal);
    setMaxSteps(p.maxSteps);
    setTimeoutSeconds(p.timeout);
  }, [selectedTestCase]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Configure test" subtitle="Target, environment, and run parameters" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[1024px] space-y-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Configure test</h2>
              <p className="mt-2 text-muted-foreground">
                Select a test case or configure a custom goal and execution parameters.
              </p>
            </div>
            <Link href="/app/runs/live" className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}>
              Save changes
            </Link>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <div className="space-y-2">
                <Label>Test Case</Label>
                <Select
                  value={selectedTestCase}
                  onValueChange={(v) => v && setSelectedTestCase(v)}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom (manual)</SelectItem>
                    <SelectItem value="TC-001">TC-001 — Wikipedia: search and scroll</SelectItem>
                    <SelectItem value="TC-002">TC-002 — Amazon: add to cart</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target URL</Label>
                <div className="relative">
                  <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    placeholder="https://staging.myapp.com/..."
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="h-11 pl-9 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Goal</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the goal in natural language. E.g., 'Search for a product and verify it appears in search results.'"
                  className="min-h-40 resize-y"
                />
              </div>

              {selectedTestCase !== "custom" && TEST_CASE_PRESETS[selectedTestCase] && (
                <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checkpoints</p>
                  <ul className="space-y-1.5">
                    {TEST_CASE_PRESETS[selectedTestCase].checkpoints.map((cp) => (
                      <li key={cp.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 font-mono text-[10px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
                          {cp.id}
                        </span>
                        <span className="text-muted-foreground">{cp.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-6 lg:col-span-4">
              <Card className="border-border/60 bg-card/60">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4 text-primary" aria-hidden="true" />
                    Execution Settings
                  </CardTitle>
                  <CardDescription>Environment, browser, and execution limits.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-2">
                    <Label>Environment</Label>
                    <Select value={environment} onValueChange={(v) => v && setEnvironment(v)}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Staging">Staging</SelectItem>
                        <SelectItem value="Production">Production</SelectItem>
                        <SelectItem value="Development">Development</SelectItem>
                        <SelectItem value="Preview">Preview</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Browser</Label>
                    <Select value={browser} onValueChange={(v) => v && setBrowser(v as "chromium" | "firefox" | "webkit")}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chromium">Chromium</SelectItem>
                        <SelectItem value="firefox">Firefox</SelectItem>
                        <SelectItem value="webkit">WebKit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Max Steps</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(Number(e.target.value))}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">Maximum agent steps (20–35 recommended)</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Timeout (seconds)</Label>
                    <Input
                      type="number"
                      min={30}
                      max={600}
                      value={timeoutSeconds}
                      onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">Agent timeout in seconds (120–600)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-6">
            <Link href="/app/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
              Cancel
            </Link>
            <Link
              href="/app/runs/live"
              onClick={() =>
                toast.success("Run launched", {
                  description: `Launching ${selectedTestCase === "custom" ? "custom test" : selectedTestCase} on ${browser}.`,
                })
              }
              className={cn(buttonVariants({ variant: "default" }), "shadow-[0_0_20px_rgba(173,198,255,0.15)]")}
            >
              <Play className="size-4" aria-hidden="true" />
              Launch Hawkeye
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
