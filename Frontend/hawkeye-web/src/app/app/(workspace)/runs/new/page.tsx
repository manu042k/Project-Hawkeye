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
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTestCases, useCreateRun } from "@/lib/api/hooks";
import { apiClient, type TestCaseInfo, type Environment } from "@/lib/api/client";
import { useProjectStore } from "@/lib/project/store";

const MODEL_PRESETS = [
  { value: "nvidia:moonshotai/kimi-k2.6", label: "NVIDIA – Kimi K2.6 (recommended)" },
  { value: "openrouter:openai/gpt-4o", label: "OpenRouter – GPT-4o" },
  { value: "openrouter:openai/gpt-oss-120b:free", label: "OpenRouter – GPT-OSS 120B (free)" },
  { value: "openrouter:google/gemma-4-31b-it:free", label: "OpenRouter – Gemma 4 31B (free)" },
  { value: "ollama:llama3.2", label: "Ollama – Llama 3.2 (local)" },
];

function NewRunPageInner() {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? "default");
  const searchParams = useSearchParams();
  const preselectedTcId = searchParams.get("tc"); // from /test-cases/:id "Run" button

  const { data: testCases, loading: tcLoading, error: tcError } = useTestCases();
  const { createRun, loading: submitting, error: submitError } = useCreateRun();

  // Unified selector value: "db:{id}" for DB cases, "yaml:{path}" for YAML cases
  const [selectedValue, setSelectedValue] = useState<string>(
    preselectedTcId ? `db:${preselectedTcId}` : ""
  );
  const [model, setModel] = useState(MODEL_PRESETS[0].value);
  const [browser, setBrowser] = useState<"chromium" | "firefox" | "webkit">("chromium");
  const [maxSteps, setMaxSteps] = useState(20);
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);
  const [record, setRecord] = useState(false);
  const [dbCases, setDbCases] = useState<Array<{ id: string; name: string }>>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentId, setEnvironmentId] = useState<string>("");

  useEffect(() => {
    apiClient.listProjectTestCases(projectId).then((res) => setDbCases(res.test_cases)).catch(() => {});
    apiClient.listEnvironments(projectId).then((res) => {
      setEnvironments(res.environments);
      const def = res.environments.find((e) => e.is_default);
      if (def) setEnvironmentId(def.id);
    }).catch(() => {});
  }, []);

  const isDbCase = selectedValue.startsWith("db:");
  const selectedDbId = isDbCase ? selectedValue.slice(3) : null;
  const selectedYamlPath = !isDbCase && selectedValue ? selectedValue.replace(/^yaml:/, "") : "";
  const selectedCase: TestCaseInfo | undefined = testCases?.find((tc) => tc.path === selectedYamlPath);

  // Auto-select first available case when lists load (only if nothing pre-selected)
  useEffect(() => {
    if (selectedValue) return;
    if (dbCases.length > 0) {
      setSelectedValue(`db:${dbCases[0].id}`);
    } else if (testCases && testCases.length > 0) {
      setSelectedValue(`yaml:${testCases[0].path}`);
      setBrowser(testCases[0].browser as "chromium" | "firefox" | "webkit");
    }
  }, [dbCases, testCases, selectedValue]);

  useEffect(() => {
    if (selectedCase) setBrowser(selectedCase.browser as "chromium" | "firefox" | "webkit");
  }, [selectedCase]);

  const canLaunch = Boolean(selectedValue) && !submitting;

  function handleLaunch() {
    if (!selectedValue) return;
    const envId = environmentId || undefined;
    if (isDbCase && selectedDbId) {
      createRun({ test_case_id: selectedDbId, model, browser, record, max_steps: maxSteps, timeout: timeoutSeconds, environment_id: envId });
    } else {
      createRun({ test_case_path: selectedYamlPath, model, browser, record, max_steps: maxSteps, timeout: timeoutSeconds, environment_id: envId });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Configure test" subtitle="Target, environment, and run parameters" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[1024px] space-y-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Configure test</h2>
              <p className="mt-2 text-muted-foreground">
                Select a test case and configure execution parameters.
              </p>
            </div>
          </header>

          {(tcError || submitError) && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {tcError ?? submitError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <div className="space-y-2">
                <Label>Test Case</Label>
                {!tcLoading && dbCases.length === 0 && (testCases ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center">
                    <p className="text-sm font-medium">No test cases in this project</p>
                    <p className="mt-1 text-xs text-muted-foreground">Create a test case first, then come back to run it.</p>
                    <Link href="/app/test-cases" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 gap-1.5")}>
                      Go to Test Cases
                    </Link>
                  </div>
                ) : tcLoading && dbCases.length === 0 ? (
                  <div className="h-11 rounded-md border border-border/60 bg-muted/30 animate-pulse" />
                ) : (
                  <Select
                    value={selectedValue}
                    onValueChange={(v) => {
                      if (!v) return;
                      setSelectedValue(v);
                    }}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Select a test case..." />
                    </SelectTrigger>
                    <SelectContent>
                      {dbCases.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Library</div>
                          {dbCases.map((tc) => (
                            <SelectItem key={`db:${tc.id}`} value={`db:${tc.id}`}>
                              {tc.name}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {(testCases ?? []).length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">YAML</div>
                          {(testCases ?? []).map((tc) => (
                            <SelectItem key={`yaml:${tc.path}`} value={`yaml:${tc.path}`}>
                              {tc.id} — {tc.name}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedCase && (
                <div className="space-y-2">
                  <Label>Goal</Label>
                  <div className="min-h-24 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                    {selectedCase.goal}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedCase.assertions} assertion{selectedCase.assertions !== 1 ? "s" : ""} defined
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PRESETS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground font-mono">{model}</p>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-4">
              <Card className="border-border/60 bg-card/60">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4 text-primary" aria-hidden="true" />
                    Execution Settings
                  </CardTitle>
                  <CardDescription>Browser, limits, and recording.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
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

                  {environments.length > 0 && (
                    <div className="space-y-2">
                      <Label>Environment</Label>
                      <Select value={environmentId} onValueChange={(v) => setEnvironmentId(v)}>
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue placeholder="None (use test case URL)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None (use test case URL)</SelectItem>
                          {environments.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}{e.is_default ? " (default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      id="record"
                      type="checkbox"
                      checked={record}
                      onChange={(e) => setRecord(e.target.checked)}
                      className="size-4 rounded border-border"
                    />
                    <Label htmlFor="record" className="cursor-pointer">
                      Record MP4
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-6">
            <Link href="/app/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
              Cancel
            </Link>
            <Button
              onClick={handleLaunch}
              disabled={!canLaunch}
              className="shadow-[0_0_20px_rgba(173,198,255,0.15)]"
            >
              <Play className="size-4" aria-hidden="true" />
              {submitting ? "Launching…" : "Launch Hawkeye"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NewRunPage() {
  return <Suspense><NewRunPageInner /></Suspense>;
}
