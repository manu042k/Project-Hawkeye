"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Play,
  Plus,
  Save,
  Trash2,
  GripVertical,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor, wordCount } from "@/components/app/rich-text-editor";
import { cn } from "@/lib/utils";
import {
  apiClient,
  type TestCaseSpec,
  type RunSummary,
  type Checkpoint,
} from "@/lib/api/client";
import { NewRunModal } from "@/components/app/new-run-modal";
import { toast } from "sonner";

const DEFAULT_PROJECT = "default";
const BROWSERS = ["chromium", "firefox", "webkit", "chrome", "msedge"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const PAGE_TYPES = ["spa", "ssr", "static", "streaming"];
const LOCALES = [
  "", "en-US", "en-GB", "en-AU", "en-CA", "fr-FR", "de-DE", "es-ES", "es-MX",
  "pt-BR", "pt-PT", "it-IT", "nl-NL", "pl-PL", "ru-RU", "ja-JP", "zh-CN",
  "zh-TW", "ko-KR", "ar-SA", "hi-IN", "tr-TR", "sv-SE", "da-DK", "fi-FI",
];

const TIMEZONES = [
  "",
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Toronto", "America/Mexico_City",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
];

type Tab = "overview" | "config" | "test-design" | "history";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
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
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
      <div>
        <span className="text-sm">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-semibold border-b border-border/60 pb-2">
      {title}
    </h3>
  );
}

function FieldRow({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: number;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-1",
      )}
    >
      {children}
    </div>
  );
}

export default function TestCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tcId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  const [tab, setTab] = useState<Tab>("overview");
  const [tc, setTc] = useState<TestCaseSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [runOpen, setRunOpen] = useState(false);

  // ── Overview ────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [suite, setSuite] = useState("");
  const [suites, setSuites] = useState<{ id: string; name: string }[]>([]);
  const [priority, setPriority] = useState("P1");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // ── Target ──────────────────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [urlStatus, setUrlStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [browser, setBrowser] = useState("chromium");
  const [vpWidth, setVpWidth] = useState(1280);
  const [vpHeight, setVpHeight] = useState(720);
  const [vpDpr, setVpDpr] = useState(1.0);
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [extraHeaders, setExtraHeaders] = useState(""); // "Key: Value" per line (non-secret)
  const [vaultHeaders, setVaultHeaders] = useState<{ id: string; headerName: string; secretName: string }[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<{ id: string; name: string }[]>([]);


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

  async function checkUrl() {
    if (!isValidUrl(url)) return;
    setUrlStatus("checking");
    try {
      await fetch(url, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(5000) });
      setUrlStatus("ok");
    } catch {
      setUrlStatus("error");
    }
  }

  function isValidUrl(val: string): boolean {
    try { const u = new URL(val); return u.protocol === "https:" || u.protocol === "http:"; }
    catch { return false; }
  }

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
    return Object.entries(h)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }

  const isNew = tcId === "new";
  const [savedView, setSavedView] = useState(!isNew);
  const editAll = () => setSavedView(false);

  async function loadTc() {
    if (isNew) {
      setLoading(false);
      return;
    }
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
      // Split extra_headers into plain lines and vault refs
      const rawHeaderLines = Object.entries(s.target?.extra_headers ?? {});
      const plainLines: string[] = [];
      const vaultRefs: { id: string; headerName: string; secretName: string }[] = [];
      for (const [k, v] of rawHeaderLines) {
        const m = v.match(/^\{\{vault:([^}]+)\}\}$/);
        if (m) vaultRefs.push({ id: crypto.randomUUID(), headerName: k, secretName: m[1] });
        else plainLines.push(`${k}: ${v}`);
      }
      setExtraHeaders(plainLines.join("\n"));
      setVaultHeaders(vaultRefs);

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
      const cps = (s.goal?.steps?.checkpoints ?? []).map((cp, i) => ({
        ...cp,
        id: `S${i + 1}`,
      }));
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
    } catch {
      /* non-fatal */
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    loadTc();
  }, [tcId]);
  useEffect(() => {
    if (tab === "history") loadRuns();
  }, [tab]);
  useEffect(() => {
    apiClient.listSuites(DEFAULT_PROJECT).then((r) => setSuites(r.suites)).catch(() => {});
  }, []);
  useEffect(() => {
    apiClient.listSecrets(DEFAULT_PROJECT).then((r) => setVaultSecrets(r.secrets)).catch(() => {});
  }, []);

  const nameValid = name.trim().length >= 10;
  const goalValid = wordCount(goal) >= 30;
  const urlValid = isValidUrl(url);
  const stepsValid = checkpoints.length > 0 && checkpoints.every((cp) => cp.description.trim() && cp.success_signal.trim());

  async function handleSave() {
    if (!nameValid) { toast.error("Name must be at least 10 characters"); return; }
    if (!urlValid) { toast.error("A valid target URL is required (set it in Config tab)"); return; }
    if (!goalValid) { toast.error("Goal must be at least 30 words"); return; }
    if (!stepsValid) { toast.error("Add at least one step with description and success signal (Steps tab)"); return; }
    setSaving(true);
    try {
      const parsedHeaders = parseHeaders(extraHeaders);
      // Merge vault header references
      for (const vh of vaultHeaders) {
        if (vh.headerName.trim() && vh.secretName) parsedHeaders[vh.headerName.trim()] = `{{vault:${vh.secretName}}}`;
      }
      const body = {
        name,
        created_by: session?.user?.email ?? null,
        goal: {
          objective: goal,
          constraints: {
            max_steps: maxSteps,
            timeout_seconds: timeoutS,
            max_retries_per_action: maxRetries,
          },
          extra_details: extraDetails || null,
          steps: checkpoints.length > 0 ? { checkpoints } : null,
        },
        suite: suite || null,
        priority,
        tags,
        save_record: saveRecord,
        target: {
          url,
          browser,
          viewport: {
            width: vpWidth,
            height: vpHeight,
            device_scale_factor: vpDpr,
          },
          page_type: pageType,
          app_description: appDesc || null,
          vault: vaultHeaders.filter((vh) => vh.secretName).map((vh) => ({ key: vh.secretName, value: "" })),
          locale: locale || null,
          timezone: timezone || null,
          extra_headers: Object.keys(parsedHeaders).length
            ? parsedHeaders
            : null,
          block_urls: [],
        },
        assertions: [],
        on_failure: {
          capture: {
            screenshot: capScreenshot,
            dom_snapshot: capDomSnapshot,
            network_log: capNetworkLog,
            console_log: capConsoleLog,
            agent_trace: capAgentTrace,
            video: capVideo,
          },
          notify: {},
        },
      };
      if (isNew) {
        const created = await apiClient.createProjectTestCase(
          DEFAULT_PROJECT,
          body,
        );
        toast.success("Test case created");
        router.push(`/app/test-cases/${created.id}`);
        return;
      }
      await apiClient.updateProjectTestCase(DEFAULT_PROJECT, tcId, body);
      toast.success("Saved");
      setSavedView(true);
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
    const next = [
      ...checkpoints,
      { id: `S${checkpoints.length + 1}`, description: "", success_signal: "" },
    ];
    setCheckpoints(next);
    setActiveCheckpoint(next.length - 1);
  }
  function updateCheckpoint(i: number, patch: Partial<Checkpoint>) {
    setCheckpoints(
      checkpoints.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    );
  }
  function removeCheckpoint(i: number) {
    const next = checkpoints
      .filter((_, j) => j !== i)
      .map((cp, j) => ({ ...cp, id: `S${j + 1}` }));
    setCheckpoints(next);
    setActiveCheckpoint(next.length > 0 ? Math.min(i, next.length - 1) : null);
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "config", label: "Config" },
    { key: "test-design", label: "Steps" },
    { key: "history", label: "History" },
  ];

  const narrowWrap = "mx-auto max-w-3xl";
  const wideWrap = "mx-auto max-w-7xl";

  const selectCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const textareaCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none";

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
      <AppTopbar
        title={isNew ? "New test case" : name || "Test case"}
        subtitle={
          isNew
            ? "Fill in the details below"
            : `v${tc?.version ?? 1} · ${tc?.status ?? "active"}`
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div
          className={cn(
            "space-y-6",
            narrowWrap,
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link
              href="/app/test-cases"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Test cases
            </Link>
            <div className="flex items-center gap-2">
              {!isNew && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRunOpen(true)}
                  disabled={!savedView}
                  title={!savedView ? "Save changes before running" : undefined}
                >
                  <Play className="size-3.5" /> Run
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !nameValid || !urlValid || !goalValid || !stepsValid}
              >
                <Save className="size-3.5" />{" "}
                {saving
                  ? isNew
                    ? "Creating…"
                    : "Saving…"
                  : isNew
                    ? "Create"
                    : "Save"}
              </Button>
            </div>
          </div>

          {/* Tabs — hide History when creating */}
          <div className="flex gap-0 border-b border-border/60">
            {TABS.filter((t) => !isNew || t.key !== "history").map((t) => (
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
                <span className="relative">
                  <span className="relative">
                    {t.key === "test-design" ? `${checkpoints.length === 1 ? "Step" : "Steps"} (${checkpoints.length})` : t.label}
                    {t.key === "test-design" && !stepsValid && (
                      <span className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-rose-500" />
                    )}
                  </span>
                  {t.key === "config" && !urlValid && (
                    <span className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-rose-500" />
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Test case name (min 10 characters)"
                  className={
                    name.length > 0 && !nameValid
                      ? "border-rose-500 focus-visible:ring-rose-500"
                      : ""
                  }
                />
                {name.length > 0 && !nameValid && (
                  <p className="text-xs text-rose-400">{name.trim().length} / 10 characters minimum</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Goal</Label>
                <p className="text-xs text-muted-foreground">
                  Natural language instruction for the agent.
                </p>
                <RichTextEditor
                  value={goal}
                  onChange={setGoal}
                  rows={6}
                  placeholder="Describe what the agent should accomplish…"
                  showWordCount
                  viewMode={savedView}
                  onEdit={editAll}
                />
                {goal.length > 0 && !goalValid && (
                  <p className="text-xs text-rose-400">{wordCount(goal)} / 30 words minimum</p>
                )}
              </div>
              <FieldRow cols={2}>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={selectCls}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>
                    Suite{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <select value={suite} onChange={(e) => setSuite(e.target.value)} className={selectCls}>
                    <option value="">No suite</option>
                    {suites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </FieldRow>
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), addTag())
                    }
                    placeholder="Add tag…"
                    className="max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={addTag}>
                    Add
                  </Button>
                </div>
              </div>
              {!isNew && (
                <div className="rounded-lg border border-border/50 bg-muted/30 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created by</span>
                    <p className="font-medium truncate">{tc?.created_by ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last run by</span>
                    <p className="font-medium truncate">{tc?.last_run_by ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">{tc?.created_at ? new Date(tc.created_at).toLocaleDateString() : "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last run</span>
                    <p className="font-medium">{tc?.last_run_at ? new Date(tc.last_run_at).toLocaleDateString() : "—"}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CONFIG ── */}
          {tab === "config" && (
            <div className="space-y-8">
              {/* Target */}
              <div className="space-y-4">
                <SectionHeader title="Target" />
                <div className="space-y-2">
                  <Label>URL <span className="text-rose-400">*</span></Label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input
                        value={url}
                        onChange={(e) => { setUrl(e.target.value); setUrlStatus("idle"); }}
                        placeholder="https://example.com"
                        type="url"
                        className={!urlValid ? "border-rose-500 focus-visible:ring-rose-500 pr-9" : "pr-9"}
                      />
                      {urlStatus === "checking" && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                      )}
                      {urlStatus === "ok" && (
                        <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-emerald-500" />
                      )}
                      {urlStatus === "error" && (
                        <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-rose-500" />
                      )}
                    </div>
                    {isValidUrl(url) && urlStatus !== "checking" && (
                      <Button variant="outline" size="sm" type="button" onClick={checkUrl}>
                        Verify
                      </Button>
                    )}
                  </div>
                  {!urlValid && (
                    <p className="text-xs text-rose-400">{url.length === 0 ? "Target URL is required" : "Enter a valid URL (e.g. https://example.com)"}</p>
                  )}
                  {urlStatus === "ok" && <p className="text-xs text-emerald-500">URL is reachable</p>}
                  {urlStatus === "error" && <p className="text-xs text-rose-400">Could not reach this URL — check it&apos;s publicly accessible</p>}
                </div>
                <FieldRow cols={2}>
                  <div className="space-y-2">
                    <Label>Browser</Label>
                    <select
                      value={browser}
                      onChange={(e) => setBrowser(e.target.value)}
                      className={selectCls}
                    >
                      {BROWSERS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Page type</Label>
                    <select
                      value={pageType}
                      onChange={(e) => setPageType(e.target.value)}
                      className={selectCls}
                    >
                      {PAGE_TYPES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </FieldRow>
                <FieldRow cols={3}>
                  <div className="space-y-2">
                    <Label>Viewport width</Label>
                    <Input
                      type="number"
                      value={vpWidth}
                      onChange={(e) => setVpWidth(Number(e.target.value))}
                      min={320}
                      max={3840}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Viewport height</Label>
                    <Input
                      type="number"
                      value={vpHeight}
                      onChange={(e) => setVpHeight(Number(e.target.value))}
                      min={240}
                      max={2160}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Device scale factor</Label>
                    <Input
                      type="number"
                      value={vpDpr}
                      onChange={(e) => setVpDpr(Number(e.target.value))}
                      min={0.5}
                      max={4}
                      step={0.5}
                    />
                  </div>
                </FieldRow>
                <FieldRow cols={2}>
                  <div className="space-y-2">
                    <Label>
                      Locale{" "}
                      <span className="text-muted-foreground text-xs">
                        (optional)
                      </span>
                    </Label>
                    <select value={locale} onChange={(e) => setLocale(e.target.value)} className={selectCls}>
                      {LOCALES.map((l) => <option key={l} value={l}>{l || "— none —"}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Timezone{" "}
                      <span className="text-muted-foreground text-xs">
                        (optional)
                      </span>
                    </Label>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectCls}>
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz || "— none —"}</option>)}
                    </select>
                  </div>
                </FieldRow>

                {/* Extra headers */}
                <div className="space-y-2">
                  <Label>Extra headers</Label>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">From Vault <span className="font-normal">(secret value injected at runtime)</span></p>
                    {vaultHeaders.map((vh, i) => (
                      <div key={vh.id} className="flex items-center gap-2">
                        <input
                          value={vh.headerName}
                          onChange={(e) => setVaultHeaders(vaultHeaders.map((h, j) => j === i ? { ...h, headerName: e.target.value } : h))}
                          placeholder="Header name"
                          className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <select
                          value={vh.secretName}
                          onChange={(e) => setVaultHeaders(vaultHeaders.map((h, j) => j === i ? { ...h, secretName: e.target.value } : h))}
                          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Select secret…</option>
                          {vaultSecrets.map((s) => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-rose-500"
                          onClick={() => setVaultHeaders(vaultHeaders.filter((_, j) => j !== i))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    {vaultSecrets.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No vault secrets found — add secrets in the Vault page first.</p>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5" type="button"
                        onClick={() => setVaultHeaders([...vaultHeaders, { id: crypto.randomUUID(), headerName: "", secretName: "" }])}>
                        <Plus className="size-3.5" /> Add from Vault
                      </Button>
                    )}
                  </div>
                </div>

                {/* Block URLs */}

              </div>

              {/* Execution */}
              <div className="space-y-4">
                <SectionHeader title="Execution" />
                <FieldRow cols={3}>
                  <div className="space-y-2">
                    <Label>Max steps</Label>
                    <Input
                      type="number"
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(Number(e.target.value))}
                      min={1}
                      max={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout (s)</Label>
                    <Input
                      type="number"
                      value={timeoutS}
                      onChange={(e) => setTimeoutS(Number(e.target.value))}
                      min={30}
                      max={3600}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Retries / action</Label>
                    <Input
                      type="number"
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Number(e.target.value))}
                      min={0}
                      max={5}
                    />
                  </div>
                </FieldRow>
                <div className="p-3 rounded-lg border border-border/60 bg-card/40">
                  <Toggle
                    checked={saveRecord}
                    onChange={setSaveRecord}
                    label="Record session video (MP4)"
                    description="Saves a screen recording to artifacts after each run"
                  />
                </div>
              </div>

              {/* Agent context */}
              <div className="space-y-4">
                <SectionHeader title="Agent context" />
                <div className="space-y-2">
                  <Label>App description</Label>
                  <RichTextEditor
                    value={appDesc}
                    onChange={setAppDesc}
                    rows={3}
                    placeholder="Brief description of the app under test…"
                    viewMode={savedView}
                    onEdit={editAll}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Extra details{" "}
                    <span className="text-muted-foreground text-xs">
                      (hints, known issues, timing quirks)
                    </span>
                  </Label>
                  <RichTextEditor
                    value={extraDetails}
                    onChange={setExtraDetails}
                    rows={5}
                    placeholder="Timing quirks, known UI behaviors, edge cases the agent should know about…"
                    viewMode={savedView}
                    onEdit={editAll}
                  />
                </div>
              </div>

              {/* On failure */}
              <div className="space-y-4">
                <SectionHeader title="On failure — capture" />
                <p className="text-xs text-muted-foreground -mt-2">
                  Artifacts automatically collected when a run fails
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Screenshot",
                      value: capScreenshot,
                      set: setCapScreenshot,
                    },
                    {
                      label: "DOM snapshot",
                      value: capDomSnapshot,
                      set: setCapDomSnapshot,
                    },
                    {
                      label: "Network log",
                      value: capNetworkLog,
                      set: setCapNetworkLog,
                    },
                    {
                      label: "Console log",
                      value: capConsoleLog,
                      set: setCapConsoleLog,
                    },
                    {
                      label: "Agent trace",
                      value: capAgentTrace,
                      set: setCapAgentTrace,
                    },
                    {
                      label: "Screen recording",
                      value: capVideo,
                      set: setCapVideo,
                    },
                  ].map(({ label, value, set }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card/30 px-3 py-2.5"
                    >
                      <span className="text-sm">{label}</span>
                      <Toggle checked={value} onChange={set} label="" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEPS & ASSERTIONS — master-detail ── */}
          {tab === "test-design" &&
            (() => {
              const cp =
                activeCheckpoint !== null
                  ? checkpoints[activeCheckpoint]
                  : null;

              return (
                <div
                  className="rounded-xl border border-border/60 bg-card/40 overflow-hidden"
                  style={{ minHeight: "calc(100vh - 260px)" }}
                >
                  {/* panel header */}
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 bg-card/60">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">Steps</span>
                      <span className="text-xs text-muted-foreground">
                        {checkpoints.length} step
                        {checkpoints.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addCheckpoint}
                    >
                      <Plus className="size-3" /> Add step
                    </Button>
                  </div>

                  {/* master | detail */}
                  <div
                    className="flex overflow-hidden"
                    style={{ height: "calc(100vh - 320px)" }}
                  >
                    {/* LEFT — step list */}
                    <div className="w-52 shrink-0 border-r border-border/60 overflow-y-auto bg-card/20">
                      {checkpoints.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-8 px-3 text-center">
                          <p className="text-xs text-muted-foreground mb-3">
                            No steps yet
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={addCheckpoint}
                          >
                            Add first step
                          </Button>
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
                                    <span className="font-mono text-[10px] opacity-60">
                                      {c.id}
                                    </span>
                                  </div>
                                  <p className="truncate text-[11px] leading-snug">
                                    {c.description ? (
                                      c.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || <em className="opacity-40">empty</em>
                                    ) : (
                                      <em className="opacity-40">empty</em>
                                    )}
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
                          {/* step num + delete */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary font-mono">
                                {activeCheckpoint + 1}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">{cp.id}</span>
                            </span>
                            <button
                              onClick={() => removeCheckpoint(activeCheckpoint)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-rose-400 transition-colors px-2 py-1 rounded hover:bg-rose-500/10"
                            >
                              <Trash2 className="size-3.5" /> Delete step
                            </button>
                          </div>

                          {/* ① What happens */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="flex size-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0">
                                1
                              </span>
                              <p className="text-xs font-semibold text-foreground">
                                What happens
                              </p>
                            </div>
                            <RichTextEditor
                              value={cp.description}
                              onChange={(v) =>
                                updateCheckpoint(activeCheckpoint, {
                                  description: v,
                                })
                              }
                              rows={4}
                              compact
                              placeholder="Describe the action or state at this step…"
                              viewMode={savedView}
                              onEdit={editAll}
                            />
                          </div>

                          {/* ② Success signal */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="flex size-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0">
                                2
                              </span>
                              <p className="text-xs font-semibold text-foreground">
                                Success signal
                              </p>
                            </div>
                            <RichTextEditor
                              value={cp.success_signal}
                              onChange={(v) =>
                                updateCheckpoint(activeCheckpoint, {
                                  success_signal: v,
                                })
                              }
                              rows={3}
                              viewMode={savedView}
                              onEdit={editAll}
                              compact
                              placeholder="How does the agent know this step passed?"
                            />
                          </div>


                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          {checkpoints.length > 0
                            ? "Select a step to edit"
                            : "Add a step to get started"}
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
                    <div
                      key={i}
                      className="h-12 rounded-lg border border-border/60 bg-muted/20 animate-pulse"
                    />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No runs for this test case yet
                  </p>
                </div>
              ) : (
                runs.map((r) => (
                  <Link
                    key={r.run_id}
                    href={`/app/artifacts/${r.run_id}`}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 hover:border-border transition-colors"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        r.status === "passed"
                          ? "bg-emerald-400"
                          : r.status === "failed" || r.status === "errored"
                            ? "bg-rose-400"
                            : "bg-amber-400",
                      )}
                    />
                    <span className="text-sm font-medium capitalize">
                      {r.status}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    {r.duration_s != null && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.duration_s.toFixed(0)}s
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      <NewRunModal open={runOpen} onClose={() => setRunOpen(false)} initialTestCaseId={isNew ? undefined : tcId} />
    </div>
  );
}
