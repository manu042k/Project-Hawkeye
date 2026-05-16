"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar, CheckSquare, ChevronDown, ChevronRight,
  Clock, Folder, GitBranch, GripVertical, Play, Plus, Search, Square, Trash2, X, Zap,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/project/store";
import { apiClient, type Schedule, type SuiteSummary, type TestCaseSummary } from "@/lib/api/client";
import { MODEL_GROUPS, DEFAULT_MODEL, ALL_MODELS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";


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
  allSuites,
  onClose,
  onSave,
}: {
  suite: SuiteSummary;
  allTestCases: TestCaseSummary[];
  allSuites: SuiteSummary[];
  onClose: () => void;
  onSave: (suiteId: string, ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(suite.test_case_ids));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  // Map tcId → suite name for test cases owned by OTHER suites
  const ownedByOther = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSuites) {
      if (s.id === suite.id) continue;
      for (const id of s.test_case_ids) map.set(id, s.name);
    }
    return map;
  }, [allSuites, suite.id]);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return lq ? allTestCases.filter((tc) => tc.name.toLowerCase().includes(lq)) : allTestCases;
  }, [allTestCases, q]);

  function toggle(id: string) {
    if (ownedByOther.has(id)) return; // locked to another suite
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
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage test cases — {suite.name}</DialogTitle>
          <DialogDescription>Select which test cases belong to this suite.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-8 text-sm" placeholder="Filter test cases…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="max-h-72 overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 divide-y divide-border/40">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No test cases found</p>
            ) : (
              filtered.map((tc) => {
                const checked = selected.has(tc.id);
                const lockedTo = ownedByOther.get(tc.id);
                const disabled = !!lockedTo;
                return (
                  <button
                    key={tc.id}
                    onClick={() => toggle(tc.id)}
                    disabled={disabled}
                    className={cn(
                      "w-full max-w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      disabled ? "opacity-40 cursor-not-allowed" :
                      checked ? "bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    {checked
                      ? <CheckSquare className="size-4 shrink-0 text-primary" />
                      : <Square className="size-4 shrink-0 text-muted-foreground/40" />
                    }
                    <span className="flex-1 min-w-0 truncate font-medium">{tc.name}</span>
                    {lockedTo ? (
                      <span className="shrink-0 text-[10px] font-mono rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                        in {lockedTo}
                      </span>
                    ) : (
                      <span className={cn(
                        "shrink-0 text-[10px] font-mono rounded px-1.5 py-0.5",
                        tc.last_run_status === "passed"    ? "bg-emerald-500/15 text-emerald-500" :
                        tc.last_run_status === "failed"    ? "bg-rose-500/15 text-rose-500" :
                        tc.last_run_status === "errored"   ? "bg-orange-500/15 text-orange-400" :
                        tc.last_run_status === "blocked"   ? "bg-yellow-500/15 text-yellow-400" :
                        tc.last_run_status === "running"   ? "bg-blue-500/15 text-blue-400" :
                        tc.last_run_status === "timed_out" ? "bg-purple-500/15 text-purple-400" :
                        "bg-muted text-muted-foreground",
                      )}>
                        {tc.last_run_status ?? "—"}
                      </span>
                    )}
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

// ─── Run Suite Modal ───────────────────────────────────────────────────────

type RunMode = "instant" | "schedule" | "git_push";
const GIT_PUSH_CRON = "0 0 31 2 *";
const isGitPushSchedule = (s: Schedule) => s.cron === GIT_PUSH_CRON;

function ExistingScheduleBadge({ schedules, mode, onDelete }: {
  schedules: Schedule[];
  mode: RunMode;
  onDelete: (id: string) => void;
}) {
  const relevant = schedules.filter((s) =>
    mode === "schedule" ? !isGitPushSchedule(s) : isGitPushSchedule(s)
  );
  if (relevant.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-amber-400">
        {mode === "schedule" ? "Existing schedule" : "Existing git push trigger"}
      </p>
      {relevant.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            {mode === "schedule" && <span>{s.cron}</span>}
            <span className="text-muted-foreground/60">·</span>
            <span>{s.branch}</span>
          </div>
          <button onClick={() => onDelete(s.id)} className="text-muted-foreground hover:text-rose-400 transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function RunSuiteModal({
  suite,
  onClose,
  onRunNow,
  onSaveSchedule,
  onSaveGitPush,
}: {
  suite: SuiteSummary;
  onClose: () => void;
  onRunNow: (suiteId: string, model: string) => Promise<void>;
  onSaveSchedule: (suiteId: string, model: string, cron: string, branch: string) => Promise<void>;
  onSaveGitPush: (suiteId: string, model: string, branch: string) => Promise<void>;
}) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? "default");
  const [mode, setMode] = useState<RunMode>("instant");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [cron, setCron] = useState("0 9 * * 1");
  const [branch, setBranch] = useState("main");
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [confirmOverride, setConfirmOverride] = useState(false);

  useEffect(() => {
    apiClient.listSchedules(projectId, suite.id)
      .then((r) => setSchedules(r.schedules))
      .catch(() => {});
  }, [suite.id]);

  // Pre-fill form when switching modes if config already exists
  useEffect(() => {
    if (mode === "schedule") {
      const existing = schedules.find((s) => !isGitPushSchedule(s));
      if (existing) { setCron(existing.cron); setBranch(existing.branch); }
    } else if (mode === "git_push") {
      const existing = schedules.find(isGitPushSchedule);
      if (existing) setBranch(existing.branch);
    }
  }, [mode, schedules]);

  const existingForMode = schedules.filter((s) =>
    mode === "schedule" ? !isGitPushSchedule(s) : isGitPushSchedule(s)
  );

  async function deleteSchedule(id: string) {
    await apiClient.deleteSchedule(projectId, suite.id, id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  async function doSave() {
    setSaving(true);
    try {
      await Promise.all(existingForMode.map((s) => apiClient.deleteSchedule(projectId, suite.id, s.id)));
      if (mode === "instant") await onRunNow(suite.id, model);
      else if (mode === "schedule") await onSaveSchedule(suite.id, model, cron, branch);
      else await onSaveGitPush(suite.id, model, branch);
      onClose();
    } catch {
      // errors handled + toasted in each handler — just stay open so user can retry
    } finally {
      setSaving(false);
      setConfirmOverride(false);
    }
  }

  function handleConfirm() {
    if (mode !== "instant" && existingForMode.length > 0) {
      setConfirmOverride(true);
    } else {
      doSave();
    }
  }

  const MODES: { id: RunMode; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: "instant",  icon: <Zap className="size-4" />,       label: "Run now",     desc: "Trigger all tests immediately" },
    { id: "schedule", icon: <Clock className="size-4" />,     label: "Schedule",    desc: "Set a recurring time to run" },
    { id: "git_push", icon: <GitBranch className="size-4" />, label: "On git push", desc: "Trigger when branch is pushed" },
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Run suite — {suite.name}</DialogTitle>
          <DialogDescription>Choose when and how to run this suite.</DialogDescription>
        </DialogHeader>

        {confirmOverride ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-400">
              An existing {mode === "schedule" ? "schedule" : "git push trigger"} already exists for this suite. Saving will replace it.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOverride(false)} disabled={saving}>Back</Button>
              <Button onClick={doSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
                {saving ? "Saving…" : "Override & save"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-5 py-1">
              {/* Mode selector */}
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setConfirmOverride(false); }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-center text-sm transition-colors",
                      mode === m.id
                        ? "border-primary/50 bg-primary/8 text-foreground"
                        : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <span className={cn("transition-colors", mode === m.id ? "text-primary" : "")}>{m.icon}</span>
                    <span className="font-medium text-xs">{m.label}</span>
                    <span className="text-[10px] leading-tight opacity-70">{m.desc}</span>
                  </button>
                ))}
              </div>

              {/* Model — all modes */}
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => { if (v) setModel(v); }}>
                  <SelectTrigger>
                    <SelectValue>
                      {ALL_MODELS.find((m) => m.value === model)?.label ?? model}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)]">
                    {MODEL_GROUPS.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.models.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule options */}
              {mode === "schedule" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Cron expression</Label>
                    <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1" className="font-mono" />
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setCron(p.value)}
                          className={cn(
                            "rounded border px-2 py-0.5 text-xs transition-colors",
                            cron === p.value
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/60 bg-muted/30 hover:bg-muted",
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch filter</Label>
                    <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono" />
                    <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">*</code> to match any branch</p>
                  </div>
                  <ExistingScheduleBadge schedules={schedules} mode="schedule" onDelete={deleteSchedule} />
                </div>
              )}

              {/* Git push options */}
              {mode === "git_push" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Branch to watch</Label>
                    <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono" />
                    <p className="text-xs text-muted-foreground">
                      Suite runs whenever this branch receives a push via the GitHub webhook.
                      Configure the URL in <span className="text-foreground font-medium">Settings → Integrations</span>.
                    </p>
                  </div>
                  <ExistingScheduleBadge schedules={schedules} mode="git_push" onDelete={deleteSchedule} />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button
                onClick={handleConfirm}
                disabled={saving || (mode === "schedule" && !cron.trim())}
                className={cn(mode === "instant" && "bg-emerald-600 hover:bg-emerald-700 text-white")}
              >
                {saving ? "…" : mode === "instant" ? "Run now" : mode === "schedule" ? "Save schedule" : "Save trigger"}
              </Button>
            </DialogFooter>
          </>
        )}
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
  const projectId = useProjectStore((s) => s.currentProject?.id ?? "default");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [cron, setCron] = useState("0 0 * * *");
  const [branch, setBranch] = useState("main");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.listSchedules(projectId, suite.id)
      .then((r) => setSchedules(r.schedules))
      .catch(() => {});
  }, [suite.id]);

  async function addSchedule() {
    setSaving(true);
    try {
      const s = await apiClient.createSchedule(projectId, suite.id, { cron, branch });
      setSchedules((prev) => [...prev, s]);
      toast.success("Schedule added");
    } catch { toast.error("Failed to add schedule"); }
    finally { setSaving(false); }
  }

  async function removeSchedule(id: string) {
    try {
      await apiClient.deleteSchedule(projectId, suite.id, id);
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

// ─── Unassigned Test Cases ────────────────────────────────────────────────

function UnassignedTestCases({
  allTestCases,
  suites,
  onMove,
}: {
  allTestCases: TestCaseSummary[];
  suites: SuiteSummary[];
  onMove: (tc: TestCaseSummary) => void;
}) {
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
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onMove(tc)}>
              <Folder className="size-3" />
              Add to suite
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Suite Row (table row style) ───────────────────────────────────────────

function SuiteRow({
  suite,
  onDelete,
  onRun,
  onManageTests,
}: {
  suite: SuiteSummary;
  onDelete: (id: string, name: string) => void;
  onRun: (s: SuiteSummary) => void;
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
          <button onClick={() => onRun(suite)} disabled={suite.test_count === 0} className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-muted/50 disabled:opacity-40 transition-colors" title="Run suite">
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
  const projectId = project?.id ?? "default";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [allTestCases, setAllTestCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [manageSuite, setManageSuite] = useState<SuiteSummary | null>(null);
  const [moveTc, setMoveTc] = useState<TestCaseSummary | null>(null);
  const [runSuite, setRunSuite] = useState<SuiteSummary | null>(null);

  function loadData() {
    Promise.all([
      apiClient.listSuites(projectId),
      apiClient.listProjectTestCases(projectId, {}),
    ])
      .then(([suitesRes, tcRes]) => {
        setSuites(suitesRes.suites);
        setAllTestCases(tcRes.test_cases);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.includes("403") ? "You don't have access to this project's suites." : "Failed to load suites.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [projectId]);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return lq ? suites.filter((s) => (s.name + " " + (s.description ?? "")).toLowerCase().includes(lq)) : suites;
  }, [q, suites]);

  async function handleCreate(name: string, description: string) {
    try {
      const s = await apiClient.createSuite(projectId, { name, description });
      setSuites((prev) => [s, ...prev]);
      toast.success(`Suite "${name}" created`);
    } catch {
      toast.error("Failed to create suite");
      throw new Error("failed");
    }
  }

  async function handleDelete(suiteId: string, name: string) {
    try {
      await apiClient.deleteSuite(projectId, suiteId);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      toast.success(`Deleted "${name}"`);
    } catch { toast.error("Failed to delete suite"); }
  }

  async function handleRunNow(suiteId: string, model: string) {
    try {
      const res = await apiClient.runSuite(projectId, suiteId, { model });
      toast.success(`Queued ${res.total} test(s)`);
      router.push("/app/runs/live");
    } catch (e) {
      toast.error(`Failed to run suite: ${e instanceof Error ? e.message : "Unknown error"}`);
      throw e;
    }
  }

  async function handleSaveSchedule(suiteId: string, _model: string, cron: string, branch: string) {
    try {
      await apiClient.createSchedule(projectId, suiteId, { cron, branch });
      toast.success("Schedule saved");
    } catch (e) {
      toast.error("Failed to save schedule");
      throw e;
    }
  }

  async function handleSaveGitPush(suiteId: string, _model: string, branch: string) {
    try {
      await apiClient.createSchedule(projectId, suiteId, { cron: "0 0 31 2 *", branch, enabled: true });
      toast.success(`Git push trigger saved for branch "${branch}"`);
    } catch (e) {
      toast.error("Failed to save git push trigger");
      throw e;
    }
  }

  async function handleSaveTestCases(suiteId: string, ids: string[]) {
    try {
      const updates: Promise<unknown>[] = [
        apiClient.updateSuite(projectId, suiteId, { test_case_ids: ids }),
      ];
      // Remove newly-claimed test cases from any other suite that currently owns them
      for (const s of suites) {
        if (s.id === suiteId) continue;
        const stolen = ids.filter((id) => s.test_case_ids.includes(id));
        if (stolen.length > 0) {
          const remaining = s.test_case_ids.filter((id) => !stolen.includes(id));
          updates.push(apiClient.updateSuite(projectId, s.id, { test_case_ids: remaining }));
        }
      }
      await Promise.all(updates);
      loadData();
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
        updates.push(apiClient.updateSuite(projectId, fromSuiteId, { test_case_ids: newIds }));
      }
      if (toSuiteId) {
        const to = suites.find((s) => s.id === toSuiteId)!;
        const newIds = [...new Set([...to.test_case_ids, tcId])];
        updates.push(apiClient.updateSuite(projectId, toSuiteId, { test_case_ids: newIds }));
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
                  onDelete={handleDelete}
                  onRun={setRunSuite}
                  onManageTests={setManageSuite}
                />
              ))}
            </div>
          )}

          {/* Test cases not in any suite */}
          {!loading && allTestCases.length > 0 && (
            <UnassignedTestCases
              allTestCases={allTestCases}
              suites={suites}
              onMove={setMoveTc}
            />
          )}

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
          allSuites={suites}
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

      {runSuite && (
        <RunSuiteModal
          suite={runSuite}
          onClose={() => setRunSuite(null)}
          onRunNow={handleRunNow}
          onSaveSchedule={handleSaveSchedule}
          onSaveGitPush={handleSaveGitPush}
        />
      )}
    </div>
  );
}
