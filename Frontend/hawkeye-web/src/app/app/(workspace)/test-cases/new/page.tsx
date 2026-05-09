"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";

const DEFAULT_PROJECT = "default";
const STEPS = ["Basics", "Goal", "Checkpoints", "Assertions", "Constraints"] as const;

type Checkpoint = { id: string; description: string; success_signal: string };
type Assertion = { id: string; type: string; description: string; params: Record<string, string> };

export default function NewTestCasePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Basics
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [browser, setBrowser] = useState("chromium");
  const [priority, setPriority] = useState("P1");
  const [tags, setTags] = useState("");

  // Step 2 — Goal
  const [goal, setGoal] = useState("");
  const [pageType, setPageType] = useState("spa");
  const [appDesc, setAppDesc] = useState("");
  const [hints, setHints] = useState("");

  // Step 3 — Checkpoints
  const [guided, setGuided] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    { id: "S1", description: "", success_signal: "" },
  ]);

  // Step 4 — Assertions
  const [assertions, setAssertions] = useState<Assertion[]>([]);

  // Step 5 — Constraints
  const [maxSteps, setMaxSteps] = useState(30);
  const [timeout, setTimeout] = useState(180);
  const [navPolicy, setNavPolicy] = useState("interact_only");

  function addCheckpoint() {
    const next = checkpoints.length + 1;
    setCheckpoints([...checkpoints, { id: `S${next}`, description: "", success_signal: "" }]);
  }

  function updateCheckpoint(i: number, field: keyof Checkpoint, val: string) {
    setCheckpoints(checkpoints.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  function removeCheckpoint(i: number) {
    setCheckpoints(checkpoints.filter((_, idx) => idx !== i));
  }

  function addAssertion() {
    const next = assertions.length + 1;
    setAssertions([...assertions, { id: `A${next}`, type: "content", description: "", params: { check_type: "text_present", text: "" } }]);
  }

  function updateAssertion(i: number, field: keyof Assertion, val: unknown) {
    setAssertions(assertions.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  }

  function removeAssertion(i: number) {
    setAssertions(assertions.filter((_, idx) => idx !== i));
  }

  function canAdvance() {
    if (step === 0) return name.trim() !== "" && url.trim() !== "";
    if (step === 1) return goal.trim() !== "";
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        goal: goal.trim(),
        target: { url: url.trim(), browser },
        priority,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        steps: guided && checkpoints.some((c) => c.description) ? {
          mode: "guided",
          checkpoints: checkpoints.filter((c) => c.description.trim()),
        } : null,
        assertions,
        constraints: { max_steps: maxSteps, timeout_seconds: timeout, navigation_policy: navPolicy, forbidden_actions: [] },
        context: {
          page_type: pageType,
          app_description: appDesc.trim() || null,
          hints: hints.split("\n").map((h) => h.trim()).filter(Boolean),
        },
      };
      const tc = await apiClient.createProjectTestCase(DEFAULT_PROJECT, body);
      router.push(`/app/test-cases/${tc.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create test case");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="New Test Case" subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`} />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Progress bar */}
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted/60"
                }`}
              />
            ))}
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">{STEPS[step]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Step 1 — Basics */}
              {step === 0 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Test case name <span className="text-rose-400">*</span></Label>
                    <Input id="name" placeholder="e.g. SauceDemo checkout flow" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="url">Target URL <span className="text-rose-400">*</span></Label>
                    <Input id="url" placeholder="https://www.saucedemo.com" value={url} onChange={(e) => setUrl(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Browser</Label>
                      <Select value={browser} onValueChange={(v) => v && setBrowser(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chromium">Chromium</SelectItem>
                          <SelectItem value="firefox">Firefox</SelectItem>
                          <SelectItem value="webkit">WebKit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["P0","P1","P2","P3"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tags">Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                    <Input id="tags" placeholder="e.g. e2e, checkout, smoke" value={tags} onChange={(e) => setTags(e.target.value)} />
                  </div>
                </>
              )}

              {/* Step 2 — Goal */}
              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="goal">Agent goal <span className="text-rose-400">*</span></Label>
                    <CardDescription className="text-xs">Describe in plain English what the agent should accomplish.</CardDescription>
                    <textarea
                      id="goal"
                      rows={5}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Log in as standard_user, add 'Sauce Labs Backpack' to cart, and verify the cart badge shows 1."
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Page type</Label>
                      <Select value={pageType} onValueChange={(v) => v && setPageType(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["spa","ssr","static","streaming"].map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="appDesc">App description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input id="appDesc" placeholder="e.g. Demo e-commerce store, credentials: standard_user / secret_sauce" value={appDesc} onChange={(e) => setAppDesc(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hints">Hints <span className="text-muted-foreground text-xs">(one per line)</span></Label>
                    <textarea
                      id="hints"
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Click 'Add to cart' on the Backpack product\nVerify cart badge increments"
                      value={hints}
                      onChange={(e) => setHints(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Step 3 — Checkpoints */}
              {step === 2 && (
                <>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="guided" checked={guided} onChange={(e) => setGuided(e.target.checked)} className="size-4 rounded" />
                    <Label htmlFor="guided">Guided mode (add step-by-step checkpoints)</Label>
                  </div>
                  {guided && (
                    <div className="space-y-3">
                      {checkpoints.map((cp, i) => (
                        <div key={i} className="grid grid-cols-[60px_1fr_1fr_32px] gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">ID</Label>
                            <Input value={cp.id} onChange={(e) => updateCheckpoint(i, "id", e.target.value)} className="h-8 text-xs font-mono" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">What happens</Label>
                            <Input value={cp.description} onChange={(e) => updateCheckpoint(i, "description", e.target.value)} placeholder="Logged in" className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Success signal</Label>
                            <Input value={cp.success_signal} onChange={(e) => updateCheckpoint(i, "success_signal", e.target.value)} placeholder="Products page visible" className="h-8 text-xs" />
                          </div>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-500 self-end" onClick={() => removeCheckpoint(i)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="gap-2" onClick={addCheckpoint}>
                        <Plus className="size-3.5" /> Add checkpoint
                      </Button>
                    </div>
                  )}
                  {!guided && <p className="text-sm text-muted-foreground">Unguided — the agent will plan its own action sequence based on the goal.</p>}
                </>
              )}

              {/* Step 4 — Assertions */}
              {step === 3 && (
                <>
                  {assertions.length === 0 && <p className="text-sm text-muted-foreground">No assertions yet. Add at least one to verify the result.</p>}
                  {assertions.map((a, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <div className="grid grid-cols-[60px_1fr_1fr_32px] gap-2 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">ID</Label>
                          <Input value={a.id} onChange={(e) => updateAssertion(i, "id", e.target.value)} className="h-8 text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select value={a.type} onValueChange={(v) => updateAssertion(i, "type", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="content">content</SelectItem>
                              <SelectItem value="console">console</SelectItem>
                              <SelectItem value="network">network</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Input value={a.description} onChange={(e) => updateAssertion(i, "description", e.target.value)} placeholder="Cart shows item" className="h-8 text-xs" />
                        </div>
                        <Button variant="ghost" size="icon" className="size-8 text-rose-500 self-end" onClick={() => removeAssertion(i)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {a.type === "content" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Check type</Label>
                            <Select value={a.params.check_type} onValueChange={(v) => updateAssertion(i, "params", { ...a.params, check_type: v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text_present">text_present</SelectItem>
                                <SelectItem value="text_absent">text_absent</SelectItem>
                                <SelectItem value="selector_present">selector_present</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Value</Label>
                            <Input value={a.params.text ?? ""} onChange={(e) => updateAssertion(i, "params", { ...a.params, text: e.target.value })} placeholder="Sauce Labs Backpack" className="h-8 text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="gap-2" onClick={addAssertion}>
                    <Plus className="size-3.5" /> Add assertion
                  </Button>
                </>
              )}

              {/* Step 5 — Constraints */}
              {step === 4 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="maxSteps">Max steps: <span className="font-mono text-primary">{maxSteps}</span></Label>
                      <input
                        id="maxSteps"
                        type="range" min={5} max={100} step={5}
                        value={maxSteps}
                        onChange={(e) => setMaxSteps(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="timeout">Timeout (s): <span className="font-mono text-primary">{timeout}</span></Label>
                      <input
                        id="timeout"
                        type="range" min={30} max={600} step={30}
                        value={timeout}
                        onChange={(e) => setTimeout(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Navigation policy</Label>
                    <Select value={navPolicy} onValueChange={(v) => v && setNavPolicy(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interact_only">interact_only — click links only</SelectItem>
                        <SelectItem value="explicit_urls_allowed">explicit_urls_allowed — may navigate by URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} className="gap-2">
              <ChevronLeft className="size-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button disabled={!canAdvance()} onClick={() => setStep(step + 1)} className="gap-2">
                Next <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button disabled={submitting || !canAdvance()} onClick={handleSubmit} className="gap-2">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                Save test case
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
