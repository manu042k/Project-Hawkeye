"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  MoreVertical,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiClient, type ProjectSummary, type ProjectMember, type RunSummary, type RunStatus } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ProjectStats = {
  pass_rate: number;
  total_runs: number;
  active_runs: number;
  test_case_count: number;
  cost_this_month_usd: number;
};

const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);


function statusColor(s: RunStatus): string {
  if (s === "passed") return "text-emerald-400";
  if (s === "failed" || s === "errored") return "text-rose-400";
  if (s === "running") return "text-amber-400";
  return "text-muted-foreground";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(email: string, name: string | null): string {
  if (name) return name.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState("overview");

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings form state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Add member modal
  const [addOpen, setAddOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [addingMember, setAddingMember] = useState(false);

  const load = useCallback(async () => {
    try {
      const [proj, s, m, r] = await Promise.all([
        apiClient.getProject(projectId),
        apiClient.getProjectStats(projectId),
        apiClient.getProjectMembers(projectId),
        apiClient.getProjectRuns(projectId),
      ]);
      setProject(proj);
      setStats(s);
      setMembers(m.members);
      setRuns(r.runs.slice(0, 10));
      setEditName(proj.name);
      setEditDesc(proj.description ?? "");
    } catch {
      toast.error("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiClient.updateProject(projectId, { name: editName, description: editDesc });
      setProject(updated);
      toast.success("Project updated");
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this project? It will be hidden from the project list.")) return;
    try {
      await apiClient.archiveProject(projectId);
      toast.success("Project archived");
      router.push("/app");
    } catch {
      toast.error("Failed to archive project");
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const m = await apiClient.addProjectMember(projectId, {
        user_email: memberEmail.trim(),
        user_name: memberName.trim() || undefined,
        role: memberRole,
      });
      setMembers((prev) => [...prev, m]);
      setAddOpen(false);
      setMemberEmail("");
      setMemberName("");
      setMemberRole("viewer");
      toast.success("Member added");
    } catch (e) {
      toast.error(String(e).includes("409") ? "Already a member" : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    try {
      const updated = await apiClient.updateProjectMember(projectId, memberId, { role });
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await apiClient.removeProjectMember(projectId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        breadcrumbs={[
          { label: "Projects", href: "/app" },
          { label: project.name },
        ]}
        title={project.name}
        subtitle={project.slug}
      />

      {/* Tab bar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-muted/25 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9">
              <TabsTrigger value="overview" className="gap-1.5 px-3 text-xs sm:text-sm">
                <FlaskConical className="size-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5 px-3 text-xs sm:text-sm">
                <Users className="size-3.5" /> Members
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{members.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 px-3 text-xs sm:text-sm">
                <Settings className="size-3.5" /> Settings
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* ── Overview ───────────────────────────────────────────── */}
          {tab === "overview" && (
            <>
              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-border/60 bg-card/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/60">
                      <FlaskConical className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Test Cases</p>
                      <p className="text-2xl font-semibold tabular-nums">{stats?.test_case_count ?? 0}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-border/60">
                      <Zap className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active Runs</p>
                      <p className="text-2xl font-semibold tabular-nums">{stats?.active_runs ?? 0}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-border/60">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pass Rate</p>
                      <p className="text-2xl font-semibold tabular-nums">
                        {stats ? `${Math.round(stats.pass_rate * 100)}%` : "—"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-card/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-border/60">
                      <Shield className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Runs</p>
                      <p className="text-2xl font-semibold tabular-nums">{stats?.total_runs ?? 0}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Project info */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Project details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {project.description && <p>{project.description}</p>}
                  <div className="flex flex-wrap gap-4 text-muted-foreground">
                    <span>Slug: <span className="font-mono text-foreground">{project.slug}</span></span>
                    <span>Created: {formatDate(project.created_at)}</span>
                    <span>Members: {members.length}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Recent runs */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Recent runs</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {runs.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground">No runs yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/60 hover:bg-transparent">
                          <TableHead className="text-xs">Test</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Started</TableHead>
                          <TableHead className="text-xs">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((r) => (
                          <TableRow
                            key={r.run_id}
                            className="cursor-pointer border-border/60"
                            onClick={() => router.push(
                              TERMINAL.has(r.status) ? `/app/artifacts/${r.run_id}` : `/app/runs/live?id=${r.run_id}`
                            )}
                          >
                            <TableCell className="font-medium">{r.test_name ?? r.run_id.slice(0, 8)}</TableCell>
                            <TableCell className={cn("capitalize", statusColor(r.status))}>{r.status}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatDate(r.created_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {r.duration_s != null ? `${r.duration_s.toFixed(1)}s` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Members ────────────────────────────────────────────── */}
          {tab === "members" && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Team members</CardTitle>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" /> Add member
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {members.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">No members yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60 hover:bg-transparent">
                        <TableHead className="text-xs">Member</TableHead>
                        <TableHead className="text-xs">Role</TableHead>
                        <TableHead className="text-xs">Added</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id} className="border-border/60">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="size-7 rounded-md border border-border/60">
                                <AvatarFallback className="rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                  {initials(m.user_email, m.user_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                {m.user_name && <p className="truncate text-sm font-medium">{m.user_name}</p>}
                                <p className="truncate text-xs text-muted-foreground">{m.user_email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={m.role}
                              onValueChange={(v) => { if (v) handleRoleChange(m.id, v); }}
                            >
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="developer">Developer</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(m.added_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="size-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-rose-400 focus:text-rose-400"
                                  onClick={() => handleRemoveMember(m.id)}
                                >
                                  <Trash2 className="mr-2 size-3.5" /> Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Settings ───────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="space-y-6">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">General</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="proj-name">Project name</Label>
                      <Input
                        id="proj-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="proj-desc">Description</Label>
                      <Textarea
                        id="proj-desc"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="max-w-sm resize-none"
                        rows={3}
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save changes
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-rose-500/20 bg-rose-500/5">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-rose-400">Danger zone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Archive project</p>
                      <p className="text-xs text-muted-foreground">
                        Hides the project from the project list. Test cases and runs are preserved.
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={handleArchive}>
                      <Trash2 className="mr-1.5 size-3.5" /> Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Add member modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={handleAddMember}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="mem-email">Email *</Label>
                <Input
                  id="mem-email"
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-name">Name (optional)</Label>
                <Input
                  id="mem-name"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={memberRole} onValueChange={(v) => { if (v) setMemberRole(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                    <SelectItem value="developer">Developer — run tests, edit cases</SelectItem>
                    <SelectItem value="viewer">Viewer — read only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addingMember || !memberEmail.trim()}>
                {addingMember && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
