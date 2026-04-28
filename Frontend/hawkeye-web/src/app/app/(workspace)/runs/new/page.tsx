"use client";

import { useState } from "react";
import Link from "next/link";
import { CloudUpload, Link as LinkIcon, Play, Settings2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function NewRunPage() {
  const [targetUrl, setTargetUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [environment, setEnvironment] = useState("Staging");
  const [device, setDevice] = useState("Desktop Chrome (1920x1080)");
  const [bypassLogin, setBypassLogin] = useState(true);
  /** 1–100 per UI-flow: higher = stricter visual matching (maps to backend tolerance policy). */
  const [visualStrictness, setVisualStrictness] = useState(75);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Configure test" subtitle="Target, environment, and run parameters" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[1024px] space-y-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Configure test</h2>
              <p className="mt-2 text-muted-foreground">
                Define parameters and assertions for your visual baseline test.
              </p>
            </div>
            <Link href="/app/runs/live" className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}>
              Save changes
            </Link>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
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
                <Label>Test Objective & Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the purpose of this run. E.g., 'Verify checkout flow visual stability post CSS refactor.'"
                  className="min-h-40 resize-y"
                />
              </div>

              <div className="space-y-2">
                <Label>Reference Materials</Label>
                <button
                  type="button"
                  onClick={() => toast.message("Static UI demo", { description: "File uploads are not persisted in this build." })}
                  className="group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-card/40 p-8 text-center transition-colors hover:bg-card/60"
                >
                  <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-transform group-hover:scale-105">
                    <CloudUpload className="size-6" aria-hidden="true" />
                  </div>
                  <div className="text-base font-semibold">Drag & drop design mocks</div>
                  <div className="mt-1 text-sm text-muted-foreground">or click to browse from your computer</div>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    JPG, PNG, PDF up to 50MB
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-4">
              <Card className="border-border/60 bg-card/60">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4 text-primary" aria-hidden="true" />
                    Execution Settings
                  </CardTitle>
                  <CardDescription>Environment, device and tolerance settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-2">
                    <Label>Environment</Label>
                    <Select value={environment} onValueChange={(v) => v && setEnvironment(v)}>
                      <SelectTrigger className="h-11">
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
                    <Label>Device Profile</Label>
                    <Select value={device} onValueChange={(v) => v && setDevice(v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Desktop Chrome (1920x1080)">Desktop Chrome (1920x1080)</SelectItem>
                        <SelectItem value="Desktop Firefox (1920x1080)">Desktop Firefox (1920x1080)</SelectItem>
                        <SelectItem value="Mobile iOS Safari (iPhone 14)">Mobile iOS Safari (iPhone 14)</SelectItem>
                        <SelectItem value="Mobile Android Chrome (Pixel 7)">Mobile Android Chrome (Pixel 7)</SelectItem>
                        <SelectItem value="Tablet Safari (iPad Pro)">Tablet Safari (iPad Pro)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/30 p-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Bypass Login</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Injects session cookie to skip auth screen.
                      </div>
                    </div>
                    <Switch checked={bypassLogin} onCheckedChange={setBypassLogin} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Visual strictness</Label>
                      <span className="font-mono text-sm font-semibold text-primary">{visualStrictness}/100</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Higher values require closer visual matches (stricter diffs). Aligns with UI-flow 1–100 scale; backend maps to pixel or SSIM policy.
                    </p>
                    <Slider
                      value={[visualStrictness]}
                      onValueChange={(v) => setVisualStrictness(Array.isArray(v) ? (v[0] ?? 1) : v ?? 1)}
                      min={1}
                      max={100}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1 — permissive</span>
                      <span>100 — strict</span>
                    </div>
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
              onClick={() => toast.success("Run launched", { description: "Routing to the live execution view." })}
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

