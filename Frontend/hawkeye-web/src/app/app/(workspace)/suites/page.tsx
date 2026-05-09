"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Folder, Play, Plus, Search, Trash2, X } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/project/store";
import { apiClient, type Schedule, type SuiteSummary } from "@/lib/api/client";
import { toast } from "sonner";

const DEFAULT_PROJECT = "default";

function percent(n: number) {
  return `${Math.round(n * 100)}%`;
}

const CRON_PRESETS = [
  { label: "Every hour",      value: "0 * * * *" },
  { label: "Every 6 hours",   value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Mon 9am)", value: "0 9 * * 1" },
];

export default function SuitesPage() {
  const project = useProjectStore((s) => s.currentProject);
  const [q, setQ] = useState("");
  const [suites, setSuites] = useState<SuiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // schedule dialog state
  const [scheduleSuite, setScheduleSuite] = useState<SuiteSummary | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedCron, setSchedCron] = useState("0 0 * * *");
  const [schedBranch, setSchedBranch] = useState("main");
  const [schedSaving, setSchedSaving] = useState(false);

  function loadSuites() {
    apiClient.listSuites(DEFAULT_PROJECT)
      .then((res) => setSuites(res.suites))
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
      await apiClient.createSuite(DEFAULT_PROJECT, { name: newName.trim() });
      setNewName("");
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
              <CardContent className="flex items-center gap-3 py-4">
                <Input
                  placeholder="Suite name…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="flex-1"
                  autoFocus
                />
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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <Card key={s.id} className="group border-border/60 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                          <Folder className="size-5" aria-hidden="true" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{s.name}</CardTitle>
                          <CardDescription className="font-mono">{s.test_count} Test{s.test_count !== 1 ? "s" : ""}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openSchedule(s)}
                          className="p-1 rounded text-muted-foreground hover:text-primary"
                          title="Manage schedules"
                        >
                          <Calendar className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id, s.name)}
                          className="p-1 rounded text-muted-foreground hover:text-rose-400"
                          title="Delete suite"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm text-muted-foreground">{s.description || "No description."}</p>

                    <div className="space-y-2 border-t border-border/60 pt-4">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.round(s.pass_rate * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-emerald-400">{percent(s.pass_rate)} Pass</span>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleRun(s.id, s.name)}
                        disabled={s.test_count === 0}
                      >
                        <Play className="size-4" aria-hidden="true" />
                        Run All
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
