"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronDown, ChevronRight, Edit2, Folder, Play, Plus, Search, Trash2, X } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/project/store";
import { apiClient, type Schedule, type SuiteSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DEFAULT_PROJECT = "default";

function percent(n: number) {
  return `${Math.round(n * 100)}%`;
}

const CRON_PRESETS = [
  { label: "Every hour",       value: "0 * * * *" },
  { label: "Every 6 hours",    value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Mon 9am)", value: "0 9 * * 1" },
];

// ---- Suite card ----

function SuiteCard({
  s,
  groups,
  onSchedule,
  onDelete,
  onRun,
  onMoveGroup,
}: {
  s: SuiteSummary;
  groups: string[];
  onSchedule: (s: SuiteSummary) => void;
  onDelete: (id: string, name: string) => void;
  onRun: (id: string, name: string) => void;
  onMoveGroup: (suiteId: string, group: string | null) => void;
}) {
  const [movingGroup, setMovingGroup] = useState(false);

  return (
    <Card className="group border-border/60 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <Folder className="size-5" aria-hidden="true" />
            </div>
            <div>
              <Link
                href={`/app/suites/${s.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-base font-semibold hover:underline"
              >
                {s.name}
              </Link>
              <CardDescription className="font-mono">{s.test_count} Test{s.test_count !== 1 ? "s" : ""}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onSchedule(s)}
              className="p-1 rounded text-muted-foreground hover:text-primary"
              title="Manage schedules"
            >
              <Calendar className="size-3.5" />
            </button>
            <button
              onClick={() => setMovingGroup((v) => !v)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              title="Move to group"
            >
              <Folder className="size-3.5" />
            </button>
            <button
              onClick={() => onDelete(s.id, s.name)}
              className="p-1 rounded text-muted-foreground hover:text-rose-400"
              title="Delete suite"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        {movingGroup && (
          <div className="mt-2">
            <select
              className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-xs"
              defaultValue={s.group ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                onMoveGroup(s.id, val);
                setMovingGroup(false);
              }}
            >
              <option value="">(no group)</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {s.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Pass rate</span>
            <span className={s.pass_rate >= 0.8 ? "text-emerald-400 font-semibold" : s.pass_rate >= 0.5 ? "text-amber-400 font-semibold" : "text-rose-400 font-semibold"}>
              {percent(s.pass_rate)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn("h-full rounded-full transition-all", s.pass_rate >= 0.8 ? "bg-emerald-500" : s.pass_rate >= 0.5 ? "bg-amber-500" : "bg-rose-500")}
              style={{ width: `${Math.round(s.pass_rate * 100)}%` }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onRun(s.id, s.name)}
          disabled={s.test_count === 0}
        >
          <Play className="size-3.5" aria-hidden="true" />
          Run All ({s.test_count})
        </Button>
      </CardContent>
    </Card>
  );
}

// ---- Group section ----

function GroupSection({
  groupName,
  suites,
  groups,
  onSchedule,
  onDelete,
  onRun,
  onMoveGroup,
  onRenameGroup,
  onDeleteGroup,
}: {
  groupName: string;
  suites: SuiteSummary[];
  groups: string[];
  onSchedule: (s: SuiteSummary) => void;
  onDelete: (id: string, name: string) => void;
  onRun: (id: string, name: string) => void;
  onMoveGroup: (suiteId: string, group: string | null) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (groupName: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(groupName);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== groupName) {
      onRenameGroup(groupName, trimmed);
    }
    setRenaming(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80 hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          <Folder className="size-3.5 text-muted-foreground" />
          {renaming ? (
            <input
              autoFocus
              className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-sm font-semibold"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setRenameValue(groupName); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span>{groupName}</span>
          )}
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono">{suites.length}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(groupName); }}
          className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground"
          title="Rename group"
        >
          <Edit2 className="size-3" />
        </button>
        <button
          onClick={() => onDeleteGroup(groupName)}
          className="p-0.5 rounded text-muted-foreground hover:text-rose-400"
          title="Remove group (ungroup suites)"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {suites.map((s) => (
            <SuiteCard
              key={s.id}
              s={s}
              groups={groups}
              onSchedule={onSchedule}
              onDelete={onDelete}
              onRun={onRun}
              onMoveGroup={onMoveGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Page ----

export default function SuitesPage() {
  const project = useProjectStore((s) => s.currentProject);
  const [q, setQ] = useState("");
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // schedule dialog state
  const [scheduleSuite, setScheduleSuite] = useState<SuiteSummary | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedCron, setSchedCron] = useState("0 0 * * *");
  const [schedBranch, setSchedBranch] = useState("main");
  const [schedSaving, setSchedSaving] = useState(false);

  function loadSuites() {
    Promise.all([
      apiClient.listSuites(DEFAULT_PROJECT),
      apiClient.getSuiteGroups(DEFAULT_PROJECT),
    ])
      .then(([suitesRes, groupsRes]) => {
        setSuites(suitesRes.suites);
        setGroups(groupsRes.groups);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadSuites(); }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return suites;
    return suites.filter((s) => (s.name + " " + s.description).toLowerCase().includes(query));
  }, [q, suites]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiClient.createSuite(DEFAULT_PROJECT, {
        name: newName.trim(),
        group: newGroup.trim() || undefined,
      });
      setNewName("");
      setNewGroup("");
      setShowCreate(false);
      loadSuites();
      toast.success("Suite created");
    } catch {
      toast.error("Failed to create suite");
    } finally {
      setCreating(false);
    }
  }

  async function openSchedule(suite: SuiteSummary) {
    setScheduleSuite(suite);
    setSchedules([]);
    apiClient.listSchedules(DEFAULT_PROJECT, suite.id)
      .then((res) => setSchedules(res.schedules))
      .catch(() => {});
  }

  async function handleAddSchedule() {
    if (!scheduleSuite) return;
    setSchedSaving(true);
    try {
      const s = await apiClient.createSchedule(DEFAULT_PROJECT, scheduleSuite.id, { cron: schedCron, branch: schedBranch });
      setSchedules((prev) => [...prev, s]);
      toast.success("Schedule added");
    } catch {
      toast.error("Failed to add schedule");
    } finally {
      setSchedSaving(false);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!scheduleSuite) return;
    try {
      await apiClient.deleteSchedule(DEFAULT_PROJECT, scheduleSuite.id, scheduleId);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      toast.success("Schedule removed");
    } catch {
      toast.error("Failed to remove schedule");
    }
  }

  async function handleDelete(suiteId: string, name: string) {
    try {
      await apiClient.deleteSuite(DEFAULT_PROJECT, suiteId);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      toast.success(`Deleted "${name}"`);
    } catch {
      toast.error("Failed to delete suite");
    }
  }

  async function handleRun(suiteId: string, name: string) {
    try {
      const res = await apiClient.runSuite(DEFAULT_PROJECT, suiteId);
      if (res.test_case_ids.length === 0) {
        toast.message(`Suite "${name}" has no test cases`);
        return;
      }
      toast.success(`Queued ${res.test_case_ids.length} test(s) for "${name}"`);
    } catch {
      toast.error("Failed to run suite");
    }
  }

  async function handleMoveGroup(suiteId: string, group: string | null) {
    try {
      const updated = await apiClient.updateSuiteGroup(DEFAULT_PROJECT, suiteId, group);
      setSuites((prev) => prev.map((s) => s.id === suiteId ? { ...s, group: updated.group } : s));
      // refresh groups list
      apiClient.getSuiteGroups(DEFAULT_PROJECT).then((r) => setGroups(r.groups)).catch(() => {});
      toast.success(group ? `Moved to "${group}"` : "Removed from group");
    } catch {
      toast.error("Failed to update group");
    }
  }

  async function handleRenameGroup(oldName: string, newName: string) {
    // Move all suites in the old group to the new group name
    const inGroup = suites.filter((s) => s.group === oldName);
    try {
      await Promise.all(inGroup.map((s) => apiClient.updateSuiteGroup(DEFAULT_PROJECT, s.id, newName)));
      setSuites((prev) => prev.map((s) => s.group === oldName ? { ...s, group: newName } : s));
      setGroups((prev) => prev.map((g) => g === oldName ? newName : g).filter((v, i, a) => a.indexOf(v) === i).sort());
      toast.success(`Renamed group to "${newName}"`);
    } catch {
      toast.error("Failed to rename group");
    }
  }

  async function handleDeleteGroup(groupName: string) {
    const inGroup = suites.filter((s) => s.group === groupName);
    try {
      await Promise.all(inGroup.map((s) => apiClient.updateSuiteGroup(DEFAULT_PROJECT, s.id, null)));
      setSuites((prev) => prev.map((s) => s.group === groupName ? { ...s, group: null } : s));
      setGroups((prev) => prev.filter((g) => g !== groupName));
      toast.success(`Removed group "${groupName}"`);
    } catch {
      toast.error("Failed to remove group");
    }
  }

  // Build grouped view
  const groupedSuites = useMemo(() => {
    const byGroup: Record<string, SuiteSummary[]> = {};
    const ungrouped: SuiteSummary[] = [];
    for (const s of filtered) {
      if (s.group) {
        byGroup[s.group] = byGroup[s.group] ?? [];
        byGroup[s.group].push(s);
      } else {
        ungrouped.push(s);
      }
    }
    return { byGroup, ungrouped };
  }, [filtered]);

  const sortedGroupNames = useMemo(() => Object.keys(groupedSuites.byGroup).sort(), [groupedSuites.byGroup]);
  const allGroups = useMemo(() => {
    const fromState = new Set(groups);
    sortedGroupNames.forEach((g) => fromState.add(g));
    return [...fromState].sort();
  }, [groups, sortedGroupNames]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Test suites"
        subtitle={project ? `${project.name} · ${project.environment}` : "Organize and run grouped tests"}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" placeholder="Search suites..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button className="shrink-0" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" />
              Create suite
            </Button>
          </div>

          {showCreate && (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <Input
                  placeholder="Suite name…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="flex-1 min-w-40"
                  autoFocus
                />
                <Input
                  list="group-suggestions"
                  placeholder="Group (optional)…"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-44"
                />
                <datalist id="group-suggestions">
                  {allGroups.map((g) => <option key={g} value={g} />)}
                </datalist>
                <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create"}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-52 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {sortedGroupNames.map((groupName) => (
                <GroupSection
                  key={groupName}
                  groupName={groupName}
                  suites={groupedSuites.byGroup[groupName]}
                  groups={allGroups}
                  onSchedule={openSchedule}
                  onDelete={handleDelete}
                  onRun={handleRun}
                  onMoveGroup={handleMoveGroup}
                  onRenameGroup={handleRenameGroup}
                  onDeleteGroup={handleDeleteGroup}
                />
              ))}

              {groupedSuites.ungrouped.length > 0 && (
                <div className="space-y-3">
                  {sortedGroupNames.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Ungrouped</p>
                  )}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {groupedSuites.ungrouped.map((s) => (
                      <SuiteCard
                        key={s.id}
                        s={s}
                        groups={allGroups}
                        onSchedule={openSchedule}
                        onDelete={handleDelete}
                        onRun={handleRun}
                        onMoveGroup={handleMoveGroup}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {suites.length === 0
                    ? "No suites yet. Create one to group your test cases."
                    : "No suites match your search."}
                </p>
                {suites.length === 0 && (
                  <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
                    <Plus className="size-4" /> Create first suite
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Schedule dialog */}
      {scheduleSuite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Schedules — {scheduleSuite.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cron triggers run this suite automatically.</p>
              </div>
              <button onClick={() => setScheduleSuite(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cron expression</Label>
                <Input
                  value={schedCron}
                  onChange={(e) => setSchedCron(e.target.value)}
                  placeholder="0 0 * * *"
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setSchedCron(p.value)}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Branch filter</Label>
                <Input
                  value={schedBranch}
                  onChange={(e) => setSchedBranch(e.target.value)}
                  placeholder="main"
                  className="font-mono text-sm"
                />
              </div>
              <Button size="sm" onClick={handleAddSchedule} disabled={schedSaving || !schedCron.trim()}>
                {schedSaving ? "Adding…" : "Add schedule"}
              </Button>
            </div>

            {schedules.length > 0 && (
              <div className="border-t border-border/60 pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active schedules</p>
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div>
                      <span className="font-mono text-xs">{s.cron}</span>
                      <span className="ml-2 text-xs text-muted-foreground">branch: {s.branch}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      className="text-muted-foreground hover:text-rose-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
