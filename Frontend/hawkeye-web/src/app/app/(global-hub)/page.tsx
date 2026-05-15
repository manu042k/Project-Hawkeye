"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FlaskConical, Plus, Settings, Zap } from "lucide-react";
import Link from "next/link";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import type { ProjectSummary as ApiProject } from "@/lib/api/client";
import { useProjectStore, type ProjectSummary } from "@/lib/project/store";
import { useRuns } from "@/lib/api/hooks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ProjectStats = {
  total_runs: number;
  active_runs: number;
  pass_rate: number;
  cost_this_month_usd: number;
};

type ProjectCard = {
  id: string;
  name: string;
  key: string;
  description: string;
  createdAt: string;
  stats: ProjectStats | null;
};

function toProjectCard(p: ApiProject): ProjectCard {
  const slug = p.slug ?? p.name;
  const key = slug.slice(0, 2).toUpperCase();
  return {
    id: p.id,
    name: p.name,
    key,
    description: p.description ?? "",
    createdAt: p.created_at,
    stats: null,
  };
}

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function GlobalProjectSelectorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading projects…</div>}>
      <ProjectSelectorContent />
    </Suspense>
  );
}

function ProjectSelectorContent() {
  const router = useRouter();
  const params = useSearchParams();
  const resume = params.get("resume") || "/app/dashboard";
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [hubTab, setHubTab] = useState("all");
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: runs } = useRuns();
  const activeRunCount = useMemo(
    () => (runs ?? []).filter((r) => r.status === "running" || r.status === "queued").length,
    [runs],
  );

  useEffect(() => {
    apiClient.getProjects()
      .then(async (res) => {
        const cards = res.projects.map(toProjectCard);
        setProjects(cards);
        setLoading(false);
        // Fetch per-project stats in parallel (non-blocking)
        const statsResults = await Promise.allSettled(
          cards.map((c) => apiClient.getProjectStats(c.id)),
        );
        setProjects(cards.map((c, i) => ({
          ...c,
          stats: statsResults[i].status === "fulfilled" ? statsResults[i].value : null,
        })));
      })
      .catch(() => {
        toast.error("Failed to load projects");
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let list = [...projects];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    if (hubTab === "recent") {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [projects, query, hubTab]);

  function enterProject(p: ProjectCard) {
    setCurrentProject({ id: p.id, name: p.name, environment: "staging", lastRunOk: null });
    router.push(resume.startsWith("/app") ? resume : "/app/dashboard");
  }

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-");
    try {
      const proj = await apiClient.createProject({ name: newName.trim(), slug });
      const card = toProjectCard(proj);
      setProjects((prev) => [card, ...prev]);
      setCurrentProject({ id: proj.id, name: proj.name, environment: "staging", lastRunOk: null });
      setDialogOpen(false);
      router.push("/app/dashboard");
    } catch {
      toast.error("Failed to create project");
    }
  }

  const totalRuns = useMemo(() => projects.reduce((s, p) => s + (p.stats?.total_runs ?? 0), 0), [projects]);
  const passRate = useMemo(() => {
    // pass_rate is 0–1 from the API; weight by total_runs for an accurate aggregate
    const totalCompleted = projects.reduce((s, p) => s + (p.stats?.total_runs ?? 0), 0);
    if (!totalCompleted) return null;
    const weightedPassed = projects.reduce((s, p) => s + (p.stats?.pass_rate ?? 0) * (p.stats?.total_runs ?? 0), 0);
    return `${Math.round((weightedPassed / totalCompleted) * 100)}%`;
  }, [projects]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        breadcrumbs={[{ label: "Organization", href: "/app" }, { label: "Projects" }]}
        title="Projects"
        subtitle="Choose a workspace to run tests"
        showSearch
        searchPlaceholder="Filter by name…"
        searchValue={query}
        onSearchChange={setQuery}
        rightSlot={
          <Button size="sm" className="hidden gap-2 sm:inline-flex" type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Create project
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-muted/25 backdrop-blur supports-[backdrop-filter]:bg-muted/20">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-6 py-3">
          <Tabs value={hubTab} onValueChange={setHubTab}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="gap-1.5 px-3 text-xs sm:text-sm">
                All
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{projects.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="recent" className="text-xs sm:text-sm">Recent</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="gap-2 sm:hidden" type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Create
          </Button>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-8">

          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/60">
                  <FlaskConical className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Projects</p>
                  <p className="text-2xl font-semibold tabular-nums">{projects.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-border/60">
                  <Zap className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active runs</p>
                  <p className="text-2xl font-semibold tabular-nums">{activeRunCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-border/60">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total runs · avg pass rate</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {totalRuns}
                    {passRate && <span className="ml-2 text-sm font-normal text-emerald-400">{passRate}</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Project directory</h2>
              <p className="text-sm text-muted-foreground">
                Open a project to run tests, manage suites, Vault, and settings.
              </p>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">{filtered.length} shown</p>
          </div>

          {/* Skeleton */}
          {loading && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-xl border border-border/60 bg-muted/40" />
              ))}
            </div>
          )}

          {/* Project grid */}
          {!loading && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => enterProject(p)}
                  className={cn(
                    "group rounded-xl border border-border/60 bg-card/60 p-5 text-left shadow-sm transition-all",
                    "hover:border-primary/35 hover:bg-card/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 shrink-0 rounded-lg border border-border/60">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                        {p.key}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate font-semibold tracking-tight">{p.name}</span>
                        {p.stats && p.stats.total_runs > 0 && p.stats.pass_rate >= 0.8 && (
                          <Badge variant="secondary" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">Passing</Badge>
                        )}
                      </div>

                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Created {formatDate(p.createdAt)}
                      </p>

                      {p.description && (
                        <p className="mt-2.5 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {p.stats ? (
                          <>
                            <span>{p.stats.total_runs} run{p.stats.total_runs !== 1 ? "s" : ""}</span>
                            {p.stats.total_runs > 0 && (
                              <span className={p.stats.pass_rate >= 0.8 ? "text-emerald-400" : "text-rose-400"}>
                                {Math.round(p.stats.pass_rate * 100)}% pass rate
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="italic opacity-50">Loading stats…</span>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          Open workspace
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <Link
                          href={`/app/projects/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Project settings"
                        >
                          <Settings className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium">{query ? "No projects match your search" : "No projects yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query ? "Try a different search term." : "Create your first project to get started."}
              </p>
              {query ? (
                <Button variant="outline" className="mt-4" onClick={() => setQuery("")}>Clear search</Button>
              ) : (
                <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" /> Create project
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={onCreateProject}>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="pname">Project name</Label>
                <Input
                  id="pname"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Payments RC"
                  className="h-11"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim()}>Create & open</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
