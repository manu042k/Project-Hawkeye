"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  Calendar, CheckSquare, ChevronDown, ChevronRight,
  Folder, GripVertical, Play, Plus, Search, Square, Trash2, X,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/project/store";
import { apiClient, type Schedule, type SuiteSummary, type TestCaseSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_PROJECT = "default";

const CRON_PRESETS = [
  { label: "Hourly",        value: "0 * * * *" },
  { label: "Every 6h",     value: "0 */6 * * *" },
  { label: "Daily",        value: "0 0 * * *" },
  { label: "Weekly",       value: "0 9 * * 1" },
];

function percent(n: number) {
  return `${Math.round(n * 100)}%`;
}

// ─── Create Suite Modal ────────────────────────────────────────────────────

function CreateSuiteModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), description.trim());
      setName("");
      setDescription("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create suite</DialogTitle>
          <DialogDescription>Group related test cases into a suite you can run together.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="suite-name">Name</Label>
            <Input
              id="suite-name"
              placeholder="e.g. Smoke tests"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suite-desc">Description <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
            <Textarea
              id="suite-desc"
              placeholder="What does this suite verify?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create suite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manage Test Cases Modal ───────────────────────────────────────────────

function ManageTestCasesModal({
  suite,
  allTestCases,
  onClose,
  onSave,
}: {
  suite: SuiteSummary;
  allTestCases: TestCaseSummary[];
  onClose: () => void;
  onSave: (suiteId: string, ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(suite.test_case_ids));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return lq ? allTestCases.filter((tc) => tc.name.toLowerCase().includes(lq)) : allTestCases;
  }, [allTestCases, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(suite.id, [...selected]);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage test cases — {suite.name}</DialogTitle>
          <DialogDescription>Select which test cases belong to this suite.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-8 text-sm" placeholder="Filter test cases…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No test cases found</p>
            ) : (
              filtered.map((tc) => {
                const checked = selected.has(tc.id);
                return (
                  <button
                    key={tc.id}
                    onClick={() => toggle(tc.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      checked ? "bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    {checked
                      ? <CheckSquare className="size-4 shrink-0 text-primary" />
                      : <Square className="size-4 shrink-0 text-muted-foreground/40" />
                    }
                    <span className="flex-1 truncate font-medium">{tc.name}</span>
                    <span className={cn(
                      "text-[10px] font-mono rounded px-1.5 py-0.5",
                      tc.last_run_status === "passed" ? "bg-emerald-500/10 text-emerald-500" :
                      tc.last_run_status === "failed" ? "bg-rose-500/10 text-rose-500" :
                      "bg-muted text-muted-foreground",
                    )}>
                      {tc.last_run_status ?? "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground">{selected.size} selected</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Move Suite Modal ──────────────────────────────────────────────────────

function MoveSuiteModal({
  suite,
  allSuites,
  onClose,
  onMove,
}: {
  suite: TestCaseSummary;
  allSuites: SuiteSummary[];
  onClose: () => void;
  onMove: (tcId: string, fromSuiteId: string | null, toSuiteId: string | null) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currentSuite = allSuites.find((s) => s.test_case_ids.includes(suite.id)) ?? null;

  async function handleMove() {
    setSaving(true);
    try {
      await onMove(suite.id, currentSuite?.id ?? null, targetId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to suite</DialogTitle>
          <DialogDescription>
            Move <span className="font-medium text-foreground">{suite.name}</span> to a different suite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {allSuites.map((s) => {
            const isCurrent = s.id === currentSuite?.id;
            return (
              <button
                key={s.id}
                onClick={() => setTargetId(s.id === targetId ? null : s.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm text-left transition-colors",
                  targetId === s.id
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border/50 hover:bg-muted/40 text-muted-foreground",
                )}
              >
                <Folder className="size-4 shrink-0" />
                <span className="flex-1 font-medium truncate">{s.name}</span>
                {isCurrent && <span className="text-[10px] text-muted-foreground/60">current</span>}
              </button>
            );
          })}
          {allSuites.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No suites available</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleMove} disabled={saving || !targetId || targetId === currentSuite?.id}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schedule Modal ────────────────────────────────────────────────────────

function ScheduleModal({
  suite,
  onClose,
}: {
  suite: SuiteSummary;
  onClose: () => void;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [cron, setCron] = useState("0 0 * * *");
  const [branch, setBranch] = useState("main");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.listSchedules(DEFAULT_PROJECT, suite.id)
      .then((r) => setSchedules(r.schedules))
      .catch(() => {});
  }, [suite.id]);

  async function addSchedule() {
    setSaving(true);
    try {
      const s = await apiClient.createSchedule(DEFAULT_PROJECT, suite.id, { cron, branch });
      setSchedules((prev) => [...prev, s]);
      toast.success("Schedule added");
    } catch { toast.error("Failed to add schedule"); }
    finally { setSaving(false); }
  }

  async function removeSchedule(id: string) {
    try {
      await apiClient.deleteSchedule(DEFAULT_PROJECT, suite.id, id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast.success("Schedule removed");
    } catch { toast.error("Failed to remove schedule"); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedules — {suite.name}</DialogTitle>
          <DialogDescription>Cron triggers that run this suite automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Cron expression</Label>
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 0 * * *" className="font-mono text-sm" />
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setCron(p.value)}
                  className="rounded border border-border/60 bg-muted/30 px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Branch filter</Label>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono text-sm" />
          </div>
          <Button size="sm" onClick={addSchedule} disabled={saving || !cron.trim()}>
            {saving ? "Adding…" : "Add schedule"}
          </Button>
        </div>

        {schedules.length > 0 && (
          <div className="border-t border-border/60 pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Active</p>
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div>
                  <span className="font-mono text-xs">{s.cron}</span>
                  <span className="ml-2 text-xs text-muted-foreground">· {s.branch}</span>
                </div>
                <button onClick={() => removeSchedule(s.id)} className="text-muted-foreground hover:text-rose-400">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Suite Row (table row style) ───────────────────────────────────────────

function SuiteRow({
  suite,
  onSchedule,
  onDelete,
  onRun,
  onManageTests,
}: {
  suite: SuiteSummary;
  onSchedule: (s: SuiteSummary) => void;
  onDelete: (id: string, name: string) => void;
  onRun: (id: string, name: string) => void;
  onManageTests: (s: SuiteSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const passRate = suite.pass_rate;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/40">
          <Folder className="size-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/app/suites/${suite.id}`} className="text-sm font-semibold hover:underline truncate" onClick={(e) => e.stopPropagation()}>
              {suite.name}
            </Link>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {suite.test_count} test{suite.test_count !== 1 ? "s" : ""}
            </span>
          </div>
          {suite.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{suite.description}</p>
          )}
        </div>

        {/* Pass rate bar */}
        <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn("h-full rounded-full", passRate >= 0.8 ? "bg-emerald-500" : passRate >= 0.5 ? "bg-amber-500" : "bg-rose-500")}
              style={{ width: `${Math.round(passRate * 100)}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-mono shrink-0",
            passRate >= 0.8 ? "text-emerald-500" : passRate >= 0.5 ? "text-amber-500" : "text-rose-500",
          )}>
            {percent(passRate)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => onManageTests(suite)}>
            <Plus className="size-3" />
            Tests
          </Button>
          <button onClick={() => onSchedule(suite)} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors" title="Schedule">
            <Calendar className="size-3.5" />
          </button>
          <button onClick={() => onRun(suite.id, suite.name)} disabled={suite.test_count === 0} className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-muted/50 disabled:opacity-40 transition-colors" title="Run all">
            <Play className="size-3.5" />
          </button>
          <button onClick={() => onDelete(suite.id, suite.name)} className="p-1.5 rounded text-muted-foreground hover:text-rose-400 hover:bg-muted/50 transition-colors" title="Delete">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded: test case list */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/10 px-4 py-3 space-y-1">
          {suite.test_count === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No test cases — click "+ Tests" to add some.</p>
          ) : (
            suite.test_case_ids.map((id) => (
              <div key={id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/40">
                <GripVertical className="size-3 text-muted-foreground/30" />
                <span className="font-mono truncate">{id}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SuitesPage() {
  const project = useProjectStore((s) => s.currentProject);
  const [q, setQ] = useState("");
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [allTestCases, setAllTestCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [scheduleSuite, setScheduleSuite] = useState<SuiteSummary | null>(null);
  const [manageSuite, setManageSuite] = useState<SuiteSummary | null>(null);
  const [moveTc, setMoveTc] = useState<TestCaseSummary | null>(null);

  function loadData() {
    Promise.all([
      apiClient.listSuites(DEFAULT_PROJECT),
      apiClient.listProjectTestCases(DEFAULT_PROJECT, {}),
    ])
      .then(([suitesRes, tcRes]) => {
        setSuites(suitesRes.suites);
        setAllTestCases(tcRes.test_cases);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return lq ? suites.filter((s) => (s.name + " " + (s.description ?? "")).toLowerCase().includes(lq)) : suites;
  }, [q, suites]);

  async function handleCreate(name: string, description: string) {
    try {
      const s = await apiClient.createSuite(DEFAULT_PROJECT, { name, description });
      setSuites((prev) => [s, ...prev]);
      toast.success(`Suite "${name}" created`);
    } catch {
      toast.error("Failed to create suite");
      throw new Error("failed");
    }
  }

  async function handleDelete(suiteId: string, name: string) {
    try {
      await apiClient.deleteSuite(DEFAULT_PROJECT, suiteId);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      toast.success(`Deleted "${name}"`);
    } catch { toast.error("Failed to delete suite"); }
  }

  async function handleRun(suiteId: string, name: string) {
    try {
      const res = await apiClient.runSuite(DEFAULT_PROJECT, suiteId);
      toast.success(`Queued ${res.test_case_ids.length} test(s) for "${name}"`);
    } catch { toast.error("Failed to run suite"); }
  }

  async function handleSaveTestCases(suiteId: string, ids: string[]) {
    try {
      await apiClient.updateSuite(DEFAULT_PROJECT, suiteId, { test_case_ids: ids });
      setSuites((prev) => prev.map((s) =>
        s.id === suiteId ? { ...s, test_case_ids: ids, test_count: ids.length } : s,
      ));
      toast.success("Test cases updated");
    } catch {
      toast.error("Failed to update suite");
      throw new Error("failed");
    }
  }

  async function handleMoveTc(tcId: string, fromSuiteId: string | null, toSuiteId: string | null) {
    try {
      const updates: Promise<unknown>[] = [];
      if (fromSuiteId) {
        const from = suites.find((s) => s.id === fromSuiteId)!;
        const newIds = from.test_case_ids.filter((id) => id !== tcId);
        updates.push(apiClient.updateSuite(DEFAULT_PROJECT, fromSuiteId, { test_case_ids: newIds }));
      }
      if (toSuiteId) {
        const to = suites.find((s) => s.id === toSuiteId)!;
        const newIds = [...new Set([...to.test_case_ids, tcId])];
        updates.push(apiClient.updateSuite(DEFAULT_PROJECT, toSuiteId, { test_case_ids: newIds }));
      }
      await Promise.all(updates);
      loadData();
      toast.success("Moved to suite");
    } catch {
      toast.error("Failed to move test case");
      throw new Error("failed");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Test suites"
        subtitle={project ? `${project.name} · ${project.environment}` : "Organize and run grouped tests"}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-5">

          {/* Toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search suites…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button className="shrink-0" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" />
              New suite
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>
          )}

          {/* Suite list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-10 text-center">
                <Folder className="size-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {suites.length === 0 ? "No suites yet. Create one to group your test cases." : "No suites match your search."}
                </p>
                {suites.length === 0 && (
                  <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
                    <Plus className="size-4" /> Create first suite
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => (
                <SuiteRow
                  key={s.id}
                  suite={s}
                  onSchedule={setScheduleSuite}
                  onDelete={handleDelete}
                  onRun={handleRun}
                  onManageTests={setManageSuite}
                />
              ))}
            </div>
          )}

          {/* Test cases not in any suite */}
          {!loading && allTestCases.length > 0 && (() => {
            const assignedIds = new Set(suites.flatMap((s) => s.test_case_ids));
            const unassigned = allTestCases.filter((tc) => !assignedIds.has(tc.id));
            if (unassigned.length === 0) return null;
            return (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">Unassigned test cases</p>
                <div className="rounded-xl border border-border/50 bg-card/30 divide-y divide-border/40 overflow-hidden">
                  {unassigned.map((tc) => (
                    <div key={tc.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-sm text-muted-foreground truncate">{tc.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setMoveTc(tc)}
                      >
                        <Folder className="size-3" />
                        Add to suite
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>
      </main>

      {/* Modals */}
      <CreateSuiteModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />

      {manageSuite && (
        <ManageTestCasesModal
          suite={manageSuite}
          allTestCases={allTestCases}
          onClose={() => setManageSuite(null)}
          onSave={handleSaveTestCases}
        />
      )}

      {moveTc && (
        <MoveSuiteModal
          suite={moveTc}
          allSuites={suites}
          onClose={() => setMoveTc(null)}
          onMove={handleMoveTc}
        />
      )}

      {scheduleSuite && (
        <ScheduleModal suite={scheduleSuite} onClose={() => setScheduleSuite(null)} />
      )}
    </div>
  );
}
