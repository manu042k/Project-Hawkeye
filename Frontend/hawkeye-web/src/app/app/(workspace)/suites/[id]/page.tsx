"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Play, Plus, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiClient, type SuiteSummary, type TestCaseSummary, type RunSummary } from "@/lib/api/client";
import { useProjectStore } from "@/lib/project/store";
import { toast } from "sonner";
const CRON_PRESETS = [
  { label: "Every hour",    value: "0 * * * *" },
  { label: "Every 6h",     value: "0 */6 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
];

type Tab = "tests" | "schedule" | "history";

export default function SuiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: suiteId } = use(params);
  const projectId = useProjectStore((s) => s.currentProject?.id ?? "default");
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("tests");
  const [suite, setSuite] = useState<SuiteSummary | null>(null);
  const [allCases, setAllCases] = useState<TestCaseSummary[]>([]);
  const [schedule, setSchedule] = useState<{ cron_expr: string | null; enabled: boolean; next_run_at: string | null } | null>(null);
  const [cronExpr, setCronExpr] = useState("0 0 * * *");
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [suiteRuns, setSuiteRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedSaving, setSchedSaving] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchCases, setSearchCases] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [suiteData, casesData] = await Promise.all([
        apiClient.getSuite(projectId, suiteId),
        apiClient.listProjectTestCases(projectId, { status: "active" }),
      ]);
      setSuite(suiteData);
      setAllCases(casesData.test_cases);
    } catch {
      toast.error("Suite not found");
      router.push("/app/suites");
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedule() {
    try {
      const s = await apiClient.getSuiteSchedule(projectId, suiteId);
      setSchedule(s);
      if (s.cron_expr) setCronExpr(s.cron_expr);
      setSchedEnabled(s.enabled);
    } catch { /* non-fatal */ }
  }

  async function loadRuns() {
    try {
      const res = await apiClient.getSuiteRuns(projectId, suiteId);
      setSuiteRuns(res.runs);
    } catch { /* non-fatal */ }
  }

  useEffect(() => { load(); loadSchedule(); }, [suiteId]);
  useEffect(() => { if (tab === "history") loadRuns(); }, [tab]);

  async function handleRunAll() {
    try {
      await apiClient.runSuite(projectId, suiteId);
      toast.success("Suite queued — check Live for progress");
    } catch {
      toast.error("Failed to run suite");
    }
  }

  async function handleAddMember(tcId: string) {
    if (!suite) return;
    setAddingId(tcId);
    try {
      const res = await apiClient.addSuiteMember(projectId, suiteId, tcId);
      setSuite({ ...suite, test_case_ids: res.test_case_ids, test_count: res.test_case_ids.length });
      toast.success("Added to suite");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("409") ? "Already in suite" : "Failed to add");
    } finally {
      setAddingId(null);
    }
  }

  async function handleRemoveMember(tcId: string) {
    if (!suite) return;
    try {
      const res = await apiClient.removeSuiteMember(projectId, suiteId, tcId);
      setSuite({ ...suite, test_case_ids: res.test_case_ids, test_count: res.test_case_ids.length });
      toast.success("Removed from suite");
    } catch {
      toast.error("Failed to remove");
    }
  }

  async function handleSaveSchedule() {
    setSchedSaving(true);
    try {
      const s = await apiClient.setSuiteSchedule(projectId, suiteId, { cron_expr: cronExpr, enabled: schedEnabled });
      setSchedule(s);
      toast.success("Schedule saved");
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setSchedSaving(false);
    }
  }

  const memberCases = useMemo(() => {
    if (!suite) return [];
    return suite.test_case_ids
      .map((id) => allCases.find((c) => c.id === id))
      .filter(Boolean) as TestCaseSummary[];
  }, [suite, allCases]);

  const availableCases = useMemo(() => {
    const inSuite = new Set(suite?.test_case_ids ?? []);
    const q = searchCases.trim().toLowerCase();
    return allCases.filter((c) => !inSuite.has(c.id) && (!q || c.name.toLowerCase().includes(q)));
  }, [allCases, suite, searchCases]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "tests", label: `Tests (${suite?.test_count ?? 0})` },
    { key: "schedule", label: "Schedule" },
    { key: "history", label: "History" },
  ];

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppTopbar title="Suite" subtitle="Loading…" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title={suite?.name ?? "Suite"}
        subtitle={`${suite?.test_count ?? 0} test${suite?.test_count !== 1 ? "s" : ""}`}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link href="/app/suites" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Test suites
            </Link>
            <Button size="sm" onClick={handleRunAll} disabled={!suite?.test_count}>
              <Play className="size-3.5" /> Run suite
            </Button>
          </div>

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
                {t.label}
              </button>
            ))}
          </div>

          {tab === "tests" && (
            <div className="space-y-5">
              {memberCases.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No test cases in this suite yet.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current tests</p>
                  {memberCases.map((tc) => (
                    <div key={tc.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3">
                      <Link href={`/app/test-cases/${tc.id}`} className="flex-1 text-sm font-medium hover:underline truncate">
                        {tc.name}
                      </Link>
                      <span className={cn(
                        "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border",
                        tc.priority === "P0" ? "border-red-500/40 bg-red-500/10 text-red-400" :
                        tc.priority === "P1" ? "border-orange-500/40 bg-orange-500/10 text-orange-400" :
                        "border-slate-500/40 bg-slate-500/10 text-slate-400",
                      )}>
                        {tc.priority}
                      </span>
                      <button
                        onClick={() => handleRemoveMember(tc.id)}
                        className="shrink-0 text-muted-foreground hover:text-rose-400 transition-colors"
                        title="Remove from suite"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 border-t border-border/60 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add test cases</p>
                <Input
                  placeholder="Search available tests…"
                  value={searchCases}
                  onChange={(e) => setSearchCases(e.target.value)}
                  className="max-w-xs"
                />
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {availableCases.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      {searchCases ? "No matches" : "All active test cases are already in this suite"}
                    </p>
                  ) : (
                    availableCases.map((tc) => (
                      <div key={tc.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                        <span className="flex-1 text-sm truncate">{tc.name}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs shrink-0"
                          onClick={() => handleAddMember(tc.id)}
                          disabled={addingId === tc.id}
                        >
                          <Plus className="size-3" />
                          Add
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "schedule" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Cron expression</Label>
                <Input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 0 * * *"
                  className="font-mono max-w-xs"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setCronExpr(p.value)}
                      className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs hover:bg-muted/80 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="sched-enabled"
                  type="checkbox"
                  checked={schedEnabled}
                  onChange={(e) => setSchedEnabled(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="sched-enabled">Enabled</Label>
              </div>
              {schedule?.next_run_at && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Next run: {new Date(schedule.next_run_at).toLocaleString()}
                </p>
              )}
              <Button onClick={handleSaveSchedule} disabled={schedSaving}>
                {schedSaving ? "Saving…" : "Save schedule"}
              </Button>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-3">
              {suiteRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No runs recorded for this suite yet</p>
                </div>
              ) : (
                suiteRuns.map((r) => (
                  <Link
                    key={r.run_id}
                    href={`/app/artifacts/${r.run_id}`}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 hover:border-border transition-colors"
                  >
                    <span className={cn(
                      "size-2 rounded-full shrink-0",
                      r.status === "passed" ? "bg-emerald-400" :
                      r.status === "failed" || r.status === "errored" ? "bg-rose-400" : "bg-amber-400",
                    )} />
                    <span className="text-sm font-medium capitalize">{r.status}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    {r.duration_s != null && (
                      <span className="font-mono text-xs text-muted-foreground">{r.duration_s.toFixed(0)}s</span>
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
