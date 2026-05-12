"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Plus, Save, Trash2, GripVertical } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/app/rich-text-editor";
import { cn } from "@/lib/utils";
import { apiClient, type TestCaseSpec, type RunSummary, type Checkpoint, type AssertionSpec } from "@/lib/api/client";
import { NewRunModal } from "@/components/app/new-run-modal";
import { toast } from "sonner";

const DEFAULT_PROJECT = "default";
const BROWSERS = ["chromium", "firefox", "webkit", "chrome", "msedge"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const PAGE_TYPES = ["spa", "ssr", "static", "streaming"];
const ASSERTION_TYPES = [
  "content", "console", "network", "state", "visual_design",
  "text_present", "element_present", "url_contains", "console_no_errors", "network_request_made",
];

type Tab = "overview" | "config" | "test-design" | "history";

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-4",
        )} />
      </button>
      <div>
        <span className="text-sm">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold border-b border-border/60 pb-2">{title}</h3>;
}

function FieldRow({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={cn("grid gap-4", cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-1")}>
      {children}
    </div>
  );
}

export default function TestCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tcId } = use(params);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [tc, setTc] = useState<TestCaseSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  // ── Overview ────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [suite, setSuite] = useState("");
  const [priority, setPriority] = useState("P1");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // ── Target ──────────────────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [browser, setBrowser] = useState("chromium");
  const [vpWidth, setVpWidth] = useState(1280);
  const [vpHeight, setVpHeight] = useState(720);
  const [vpDpr, setVpDpr] = useState(1.0);
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [extraHeaders, setExtraHeaders] = useState(""); // "Key: Value" per line
  const [blockUrls, setBlockUrls] = useState("");       // one pattern per line

  // ── Execution ───────────────────────────────────────────────────────────────
  const [maxSteps, setMaxSteps] = useState(30);
  const [timeoutS, setTimeoutS] = useState(180);
  const [maxRetries, setMaxRetries] = useState(2);
  const [saveRecord, setSaveRecord] = useState(false);
  const [extraDetails, setExtraDetails] = useState("");

  // ── Agent context (now in target + goal.extra_details) ──────────────────────
  const [pageType, setPageType] = useState("spa");
  const [appDesc, setAppDesc] = useState("");

  // ── On failure ──────────────────────────────────────────────────────────────
  const [capScreenshot, setCapScreenshot] = useState(true);
  const [capDomSnapshot, setCapDomSnapshot] = useState(true);
  const [capNetworkLog, setCapNetworkLog] = useState(true);
  const [capConsoleLog, setCapConsoleLog] = useState(true);
  const [capAgentTrace, setCapAgentTrace] = useState(true);
  const [capVideo, setCapVideo] = useState(false);

  // ── Steps ───────────────────────────────────────────────────────────────────
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [activeCheckpoint, setActiveCheckpoint] = useState<number | null>(null);

  // ── History ─────────────────────────────────────────────────────────────────
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);

  // ── helpers: parse/format extra_headers ─────────────────────────────────────
  function parseHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return Object.keys(out).length ? out : {};
  }
  function formatHeaders(h: Record<string, string> | null): string {
    if (!h) return "";
    return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");
  }

  async function loadTc() {
    setLoading(true);
    try {
      const data = await apiClient.getProjectTestCase(DEFAULT_PROJECT, tcId);
      setTc(data);
      const s = data.spec;
      // Overview
      setName(s.name);
      setGoal(s.goal?.objective ?? "");
      setSuite(s.suite ?? "");
      setPriority(s.priority ?? "P1");
      setTags(s.tags ?? []);
      // Target
      setUrl(s.target?.url ?? "");
      setBrowser(s.target?.browser ?? "chromium");
      setVpWidth(s.target?.viewport?.width ?? 1280);
      setVpHeight(s.target?.viewport?.height ?? 720);
      setVpDpr(s.target?.viewport?.device_scale_factor ?? 1.0);
      setLocale(s.target?.locale ?? "");
      setTimezone(s.target?.timezone ?? "");
      setExtraHeaders(formatHeaders(s.target?.extra_headers ?? null));
      setBlockUrls((s.target?.block_urls ?? []).join("\n"));
      // Context (now in target + goal)
      setPageType(s.target?.page_type ?? "spa");
      setAppDesc(s.target?.app_description ?? "");
      // Execution (constraints now inside goal)
      setMaxSteps(s.goal?.constraints?.max_steps ?? 30);
      setTimeoutS(s.goal?.constraints?.timeout_seconds ?? 180);
      setMaxRetries(s.goal?.constraints?.max_retries_per_action ?? 2);
      setSaveRecord(data.save_record ?? false);
      setExtraDetails(s.goal?.extra_details ?? "");
      // On failure
      const cap = s.on_failure?.capture;
      setCapScreenshot(cap?.screenshot ?? true);
      setCapDomSnapshot(cap?.dom_snapshot ?? true);
      setCapNetworkLog(cap?.network_log ?? true);
      setCapConsoleLog(cap?.console_log ?? true);
      setCapAgentTrace(cap?.agent_trace ?? true);
      setCapVideo(cap?.video ?? false);
      // Steps (now inside goal.steps)
      const cps = (s.goal?.steps?.checkpoints ?? []).map((cp) => ({ ...cp, assertions: cp.assertions ?? [] }));
      setCheckpoints(cps);
      setActiveCheckpoint(cps.length > 0 ? 0 : null);
    } catch {
      toast.error("Failed to load test case");
      router.push("/app/test-cases");
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns() {
    if (runsLoaded) return;
    setRunsLoading(true);
    try {
      const res = await apiClient.getTestCaseRuns(DEFAULT_PROJECT, tcId);
      setRuns(res.runs);
      setRunsLoaded(true);
    } catch { /* non-fatal */ } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => { loadTc(); }, [tcId]);
  useEffect(() => { if (tab === "history") loadRuns(); }, [tab]);

  async function handleSave() {
    if (!tc) return;
    setSaving(true);
    try {
      const parsedHeaders = parseHeaders(extraHeaders);
      await apiClient.updateProjectTestCase(DEFAULT_PROJECT, tcId, {
        name,
        goal: {
          objective: goal,
          constraints: { max_steps: maxSteps, timeout_seconds: timeoutS, max_retries_per_action: maxRetries },
          extra_details: extraDetails || null,
          steps: checkpoints.length > 0 ? { checkpoints } : null,
        },
        suite: suite || null,
        priority, tags,
        save_record: saveRecord,
        target: {
          url, browser,
          viewport: { width: vpWidth, height: vpHeight, device_scale_factor: vpDpr },
          page_type: pageType,
          app_description: appDesc || null,
          vault: [],
          locale: locale || null,
          timezone: timezone || null,
          extra_headers: Object.keys(parsedHeaders).length ? parsedHeaders : null,
          block_urls: blockUrls.split("\n").map(s => s.trim()).filter(Boolean),
        },
        assertions: checkpoints.flatMap((cp) => cp.assertions ?? []),
        on_failure: {
          capture: {
            screenshot: capScreenshot, dom_snapshot: capDomSnapshot,
            network_log: capNetworkLog, console_log: capConsoleLog,
            agent_trace: capAgentTrace, video: capVideo,
          },
          notify: {},
        },
      });
      toast.success("Saved");
      await loadTc();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function addCheckpoint() {
    const next = [...checkpoints, { id: `CP${checkpoints.length + 1}`, description: "", success_signal: "", assertions: [] }];
    setCheckpoints(next);
    setActiveCheckpoint(next.length - 1);
  }
  function updateCheckpoint(i: number, patch: Partial<Checkpoint>) {
    setCheckpoints(checkpoints.map((c, j) => j === i ? { ...c, ...patch } : c));
  }
  function removeCheckpoint(i: number) {
    const next = checkpoints.filter((_, j) => j !== i);
    setCheckpoints(next);
    setActiveCheckpoint(next.length > 0 ? Math.min(i, next.length - 1) : null);
  }
  function addAssertion(cpIndex: number) {
    const asts = checkpoints[cpIndex].assertions ?? [];
    updateCheckpoint(cpIndex, { assertions: [...asts, { id: `A${asts.length + 1}`, type: "content", description: "", params: {} }] });
  }
  function updateAssertion(cpIndex: number, aIdx: number, patch: Partial<AssertionSpec>) {
    const asts = (checkpoints[cpIndex].assertions ?? []).map((a, j) => j === aIdx ? { ...a, ...patch } : a);
    updateCheckpoint(cpIndex, { assertions: asts });
  }
  function removeAssertion(cpIndex: number, aIdx: number) {
    const asts = (checkpoints[cpIndex].assertions ?? []).filter((_, j) => j !== aIdx);
    updateCheckpoint(cpIndex, { assertions: asts });
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "config", label: "Config" },
    { key: "test-design", label: "Steps & Assertions" },
    { key: "history", label: "History" },
  ];

  const narrowWrap = "mx-auto max-w-3xl";
  const wideWrap = "mx-auto max-w-7xl";

  const selectCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const textareaCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none";

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Test case" subtitle="Loading…" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title={name || "Test case"} subtitle={`v${tc?.version ?? 1} · ${tc?.status ?? "active"}`} />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className={cn("space-y-6", tab === "test-design" ? wideWrap : narrowWrap)}>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link href="/app/test-cases" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Test cases
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setRunOpen(true)}>
                <Play className="size-3.5" /> Run
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="size-3.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-border/60">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.key === "test-design"
                  ? `Steps (${checkpoints.length}) & Assertions (${checkpoints.reduce((n, c) => n + (c.assertions?.length ?? 0), 0)})`
                  : t.label}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test case name" />
              </div>
              <div className="space-y-2">
                <Label>Goal</Label>
                <p className="text-xs text-muted-foreground">Natural language instruction for the agent. Supports **markdown**.</p>
                <RichTextEditor value={goal} onChange={setGoal} rows={6} placeholder="Describe what the agent should accomplish…" />
              </div>
              <FieldRow cols={2}>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Suite <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="e.g. checkout, auth, smoke" />
                </div>
              </FieldRow>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-muted-foreground">{tc?.status ?? "active"}</div>
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-xs">
                      {tag}
                      <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="text-muted-foreground hover:text-foreground">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="Add tag…" className="max-w-xs" />
                  <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIG ── */}
          {tab === "config" && (
            <div className="space-y-8">

              {/* Target */}
              <div className="space-y-4">
                <SectionHeader title="Target" />
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" type="url" />
                </div>
                <FieldRow cols={2}>
                  <div className="space-y-2">
                    <Label>Browser</Label>
                    <select value={browser} onChange={(e) => setBrowser(e.target.value)} className={selectCls}>
                      {BROWSERS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Page type</Label>
                    <select value={pageType} onChange={(e) => setPageType(e.target.value)} className={selectCls}>
                      {PAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </FieldRow>
                <FieldRow cols={3}>
                  <div className="space-y-2">
                    <Label>Viewport width</Label>
                    <Input type="number" value={vpWidth} onChange={(e) => setVpWidth(Number(e.target.value))} min={320} max={3840} />
                  </div>
                  <div className="space-y-2">
                    <Label>Viewport height</Label>
                    <Input type="number" value={vpHeight} onChange={(e) => setVpHeight(Number(e.target.value))} min={240} max={2160} />
                  </div>
                  <div className="space-y-2">
                    <Label>Device scale factor</Label>
                    <Input type="number" value={vpDpr} onChange={(e) => setVpDpr(Number(e.target.value))} min={0.5} max={4} step={0.5} />
                  </div>
                </FieldRow>
                <FieldRow cols={2}>
                  <div className="space-y-2">
                    <Label>Locale <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" />
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
                  </div>
                </FieldRow>

                {/* Extra headers */}
                <div className="space-y-2">
                  <Label>Extra headers <span className="text-muted-foreground text-xs">(Key: Value, one per line)</span></Label>
                  <textarea value={extraHeaders} onChange={(e) => setExtraHeaders(e.target.value)} rows={3}
                    className={textareaCls} placeholder={"Authorization: Bearer token\nX-Custom-Header: value"} />
                </div>

                {/* Block URLs */}
                <div className="space-y-2">
                  <Label>Block URLs <span className="text-muted-foreground text-xs">(regex patterns, one per line)</span></Label>
                  <textarea value={blockUrls} onChange={(e) => setBlockUrls(e.target.value)} rows={3}
                    className={textareaCls} placeholder={".*\\.analytics\\.com.*\n.*tracking.*"} />
                </div>
              </div>

              {/* Execution */}
              <div className="space-y-4">
                <SectionHeader title="Execution" />
                <FieldRow cols={3}>
                  <div className="space-y-2">
                    <Label>Max steps</Label>
                    <Input type="number" value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} min={1} max={200} />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout (s)</Label>
                    <Input type="number" value={timeoutS} onChange={(e) => setTimeoutS(Number(e.target.value))} min={30} max={3600} />
                  </div>
                  <div className="space-y-2">
                    <Label>Retries / action</Label>
                    <Input type="number" value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} min={0} max={5} />
                  </div>
                </FieldRow>
                <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                  <Toggle checked={saveRecord} onChange={setSaveRecord} label="Record session video (MP4)"
                    description="Saves a screen recording to artifacts after each run" />
                </div>
              </div>

              {/* Agent context */}
              <div className="space-y-4">
                <SectionHeader title="Agent context" />
                <div className="space-y-2">
                  <Label>App description</Label>
                  <RichTextEditor value={appDesc} onChange={setAppDesc} rows={3} placeholder="Brief description of the app under test…" />
                </div>
                <div className="space-y-2">
                  <Label>Extra details <span className="text-muted-foreground text-xs">(hints, known issues, timing quirks)</span></Label>
                  <RichTextEditor value={extraDetails} onChange={setExtraDetails} rows={5} placeholder="Timing quirks, known UI behaviors, edge cases the agent should know about…" />
                </div>
              </div>

              {/* On failure */}
              <div className="space-y-4">
                <SectionHeader title="On failure — capture" />
                <p className="text-xs text-muted-foreground -mt-2">Artifacts automatically collected when a run fails</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Screenshot", value: capScreenshot, set: setCapScreenshot },
                    { label: "DOM snapshot", value: capDomSnapshot, set: setCapDomSnapshot },
                    { label: "Network log", value: capNetworkLog, set: setCapNetworkLog },
                    { label: "Console log", value: capConsoleLog, set: setCapConsoleLog },
                    { label: "Agent trace", value: capAgentTrace, set: setCapAgentTrace },
                    { label: "Screen recording", value: capVideo, set: setCapVideo },
                  ].map(({ label, value, set }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
                      <span className="text-sm">{label}</span>
                      <Toggle checked={value} onChange={set} label="" />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── STEPS & ASSERTIONS — master-detail ── */}
          {tab === "test-design" && (() => {
            const cp = activeCheckpoint !== null ? checkpoints[activeCheckpoint] : null;
            const cpAssertions = cp?.assertions ?? [];
            return (
              <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden" style={{ minHeight: "calc(100vh - 260px)" }}>

                {/* panel header */}
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 bg-card/60">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Steps</span>
                    <span className="text-xs text-muted-foreground">{checkpoints.length} step{checkpoints.length !== 1 ? "s" : ""}</span>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCheckpoint}>
                    <Plus className="size-3" /> Add step
                  </Button>
                </div>

                {/* master | detail */}
                <div className="flex overflow-hidden" style={{ height: "calc(100vh - 320px)" }}>

                  {/* LEFT — step list */}
                  <div className="w-52 shrink-0 border-r border-border/60 overflow-y-auto bg-card/20">
                    {checkpoints.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-8 px-3 text-center">
                        <p className="text-xs text-muted-foreground mb-3">No steps yet</p>
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={addCheckpoint}>Add first step</Button>
                      </div>
                    ) : (
                      <ul className="py-1">
                        {checkpoints.map((c, i) => (
                          <li key={i}>
                            <button
                              onClick={() => setActiveCheckpoint(i)}
                              className={cn(
                                "w-full text-left px-3 py-3 text-xs flex items-start gap-2 border-b border-border/40 transition-colors group",
                                activeCheckpoint === i
                                  ? "bg-primary/10 text-foreground"
                                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                              )}
                            >
                              <GripVertical className="size-3 mt-0.5 shrink-0 opacity-30 group-hover:opacity-60" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="font-mono text-[10px] opacity-60">{c.id}</span>
                                  {(c.assertions?.length ?? 0) > 0 && (
                                    <span className="rounded-full bg-primary/15 px-1 text-[9px] font-semibold text-primary">
                                      {c.assertions!.length}
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-[11px] leading-snug">
                                  {c.description
                                    ? c.description.slice(0, 50).replace(/[*_`#]/g, "")
                                    : <em className="opacity-40">empty</em>}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* RIGHT — step editor */}
                  <div className="flex-1 overflow-y-auto">
                    {cp !== null && activeCheckpoint !== null ? (
                      <div className="p-5 space-y-5">

                        {/* step id + delete */}
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            value={cp.id}
                            onChange={(e) => updateCheckpoint(activeCheckpoint, { id: e.target.value })}
                            className="w-28 h-7 font-mono text-xs"
                            placeholder="CP1"
                          />
                          <button onClick={() => removeCheckpoint(activeCheckpoint)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-rose-400 transition-colors px-2 py-1 rounded hover:bg-rose-500/10">
                            <Trash2 className="size-3.5" /> Delete step
                          </button>
                        </div>

                        {/* ① What happens */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0">1</span>
                            <p className="text-xs font-semibold text-foreground">What happens</p>
                          </div>
                          <RichTextEditor
                            value={cp.description}
                            onChange={(v) => updateCheckpoint(activeCheckpoint, { description: v })}
                            rows={4} compact
                            placeholder="Describe the action or state at this step…"
                          />
                        </div>

                        {/* ② Success signal */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0">2</span>
                            <p className="text-xs font-semibold text-foreground">Success signal</p>
                          </div>
                          <RichTextEditor
                            value={cp.success_signal}
                            onChange={(v) => updateCheckpoint(activeCheckpoint, { success_signal: v })}
                            rows={3} compact
                            placeholder="How does the agent know this step passed?"
                          />
                        </div>

                        {/* ③ Assertions */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex size-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0">3</span>
                              <p className="text-xs font-semibold text-foreground">Assertions</p>
                              <span className="text-xs text-muted-foreground">{cpAssertions.length}</span>
                            </div>
                            <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                              onClick={() => addAssertion(activeCheckpoint)}>
                              <Plus className="size-3" /> Add
                            </Button>
                          </div>

                          {cpAssertions.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/60 py-4 text-center">
                              <p className="text-xs text-muted-foreground">No assertions for this step</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {cpAssertions.map((a, ai) => (
                                <div key={ai} className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={a.id}
                                      onChange={(e) => updateAssertion(activeCheckpoint, ai, { id: e.target.value })}
                                      className="w-16 h-6 font-mono text-[11px]"
                                      placeholder="A1"
                                    />
                                    <select
                                      value={a.type}
                                      onChange={(e) => updateAssertion(activeCheckpoint, ai, { type: e.target.value })}
                                      className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                      {ASSERTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <button onClick={() => removeAssertion(activeCheckpoint, ai)}
                                      className="text-muted-foreground hover:text-rose-400 transition-colors">
                                      <Trash2 className="size-3" />
                                    </button>
                                  </div>
                                  <RichTextEditor
                                    value={a.description}
                                    onChange={(v) => updateAssertion(activeCheckpoint, ai, { description: v })}
                                    rows={2} compact
                                    placeholder="What does this assertion verify?"
                                  />
                                  <textarea
                                    defaultValue={JSON.stringify(a.params, null, 2)}
                                    onBlur={(e) => {
                                      try { updateAssertion(activeCheckpoint, ai, { params: JSON.parse(e.target.value) }); } catch { /* invalid JSON */ }
                                    }}
                                    rows={3}
                                    className="w-full rounded border border-input bg-muted/20 px-2.5 py-1.5 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                    placeholder='{ "text": "expected value" }'
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {checkpoints.length > 0 ? "Select a step to edit" : "Add a step to get started"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── HISTORY ── */}
          {tab === "history" && (
            <div className="space-y-3">
              {runsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg border border-border/60 bg-muted/20 animate-pulse" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No runs for this test case yet</p>
                </div>
              ) : (
                runs.map((r) => (
                  <Link key={r.run_id} href={`/app/artifacts/${r.run_id}`}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 hover:border-border transition-colors">
                    <span className={cn("size-2 rounded-full shrink-0",
                      r.status === "passed" ? "bg-emerald-400" :
                      r.status === "failed" || r.status === "errored" ? "bg-rose-400" : "bg-amber-400")} />
                    <span className="text-sm font-medium capitalize">{r.status}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    {r.duration_s != null && <span className="font-mono text-xs text-muted-foreground">{r.duration_s.toFixed(0)}s</span>}
                  </Link>
                ))
              )}
            </div>
          )}

        </div>
      </main>

      <NewRunModal open={runOpen} onClose={() => setRunOpen(false)} />
    </div>
  );
}
