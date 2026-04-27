"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Filter,
  LayoutGrid,
  Plus,
  Star,
  Users,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoProjectCards, type DemoProjectCard } from "@/lib/mock-data/projects";
import { useProjectStore, type ProjectSummary } from "@/lib/project/store";
import { cn } from "@/lib/utils";

const envLabel: Record<ProjectSummary["environment"], string> = {
  production: "Production",
  staging: "Staging",
  local: "Local",
};

export default function GlobalProjectSelectorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading projects…</div>
      }
    >
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
  const [newEnv, setNewEnv] = useState<ProjectSummary["environment"]>("staging");
  const [query, setQuery] = useState("");
  const [hubTab, setHubTab] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<string>("all");

  const globalMetrics = useMemo(
    () => ({
      uptime: "99.98%",
      runs: 3,
      projects: demoProjectCards.length,
    }),
    []
  );

  const filtered = useMemo(() => {
    let list = [...demoProjectCards];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q)
      );
    }
    if (hubTab === "starred") list = list.filter((p) => p.starred);
    if (hubTab === "recent") {
      list = [...list].sort((a, b) => {
        const rank = (x: DemoProjectCard) =>
          x.updatedLabel.includes("h ago") ? 2 : x.updatedLabel.includes("d ago") ? 1 : 0;
        return rank(b) - rank(a);
      });
    }
    if (envFilter !== "all") list = list.filter((p) => p.environment === envFilter);
    return list;
  }, [query, hubTab, envFilter]);

  function enterProject(p: DemoProjectCard) {
    setCurrentProject({
      id: p.id,
      name: p.name,
      environment: p.environment,
      lastRunOk: p.lastRunOk,
    });
    router.push(resume.startsWith("/app") ? resume : "/app/dashboard");
  }

  function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `proj-${newName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    setCurrentProject({
      id,
      name: newName.trim(),
      environment: newEnv,
      lastRunOk: null,
    });
    setDialogOpen(false);
    router.push("/app/dashboard");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        breadcrumbs={[{ label: "Organization", href: "/app" }, { label: "Projects" }]}
        title="Projects"
        subtitle="Demo Org · Choose a sandboxed workspace"
        showSearch
        searchPlaceholder="Filter by name or key…"
        searchValue={query}
        onSearchChange={setQuery}
        rightSlot={
          <Button size="sm" className="hidden gap-2 sm:inline-flex" type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Create project
          </Button>
        }
      />

      <div className="sticky top-16 z-30 border-b border-border/60 bg-muted/25 backdrop-blur supports-[backdrop-filter]:bg-muted/20">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={hubTab} onValueChange={setHubTab} className="w-full lg:w-auto">
            <TabsList className="h-9 w-full justify-start lg:w-auto">
              <TabsTrigger value="all" className="gap-1.5 px-3 text-xs sm:text-sm">
                All
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {demoProjectCards.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="starred" className="gap-1.5 px-3 text-xs sm:text-sm">
                Starred
                <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
                  {demoProjectCards.filter((p) => p.starred).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="recent" className="text-xs sm:text-sm">
                Recent activity
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="hidden text-xs text-muted-foreground sm:inline">Environment</span>
              <Select value={envFilter} onValueChange={(v) => v && setEnvFilter(v)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 gap-2")}
              >
                <ArrowUpDown className="size-4" aria-hidden />
                Sort
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Last updated</DropdownMenuItem>
                <DropdownMenuItem>Name (A–Z)</DropdownMenuItem>
                <DropdownMenuItem>Key</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-2 sm:hidden" type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Org uptime</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{globalMetrics.uptime}</p>
                </div>
                <LayoutGrid className="size-8 shrink-0 text-primary/80" aria-hidden />
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Active runs</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{globalMetrics.runs}</p>
                </div>
                <Badge variant="secondary">Live</Badge>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Projects</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{globalMetrics.projects}</p>
                </div>
                <span className="text-xs text-muted-foreground">This organization</span>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Project directory</h2>
              <p className="text-sm text-muted-foreground">
                Open a project to run tests, manage suites, baselines, Vault, and project settings.
              </p>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">{filtered.length} shown</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => enterProject(p)}
                className={cn(
                  "group rounded-xl border border-border/60 bg-card/60 p-5 text-left shadow-sm transition-all",
                  "hover:border-primary/35 hover:bg-card/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold tracking-tight">{p.name}</span>
                          {p.starred ? (
                            <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {p.key}
                          </Badge>
                          <span>{envLabel[p.environment]}</span>
                          <span className="text-border">·</span>
                          <span>{p.updatedLabel}</span>
                        </div>
                      </div>
                      {p.lastRunOk === null ? (
                        <Badge variant="outline">No runs</Badge>
                      ) : (
                        <Badge variant={p.lastRunOk ? "secondary" : "destructive"} className="shrink-0">
                          {p.lastRunOk ? "Passing" : "Failing"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" aria-hidden />
                        {p.members} members
                      </span>
                      <span>{p.openIssues} open items</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                      Open workspace
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
              <p className="font-medium">No projects match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try clearing search or changing the environment filter.</p>
              <Button
                variant="outline"
                className="mt-4"
                type="button"
                onClick={() => {
                  setQuery("");
                  setEnvFilter("all");
                  setHubTab("all");
                }}
              >
                Reset filters
              </Button>
            </div>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            Account and billing are organization-level — open them from the left rail or your avatar.
          </p>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={onCreateProject}>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>Stored locally for this demo — becomes your active workspace.</DialogDescription>
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
                />
              </div>
              <div className="grid gap-2">
                <Label>Environment / type</Label>
                <Select value={newEnv} onValueChange={(v) => v && setNewEnv(v as ProjectSummary["environment"])}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newName.trim()}>
                Create & open
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
