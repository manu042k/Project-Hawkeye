"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity, Bell, CheckCircle2, Copy, ExternalLink, FileText, FlaskConical,
  Loader2, MoreVertical, Plus, Save, Trash2, Upload, Users, Zap,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiClient, type ProjectSummary, type ProjectMember, type RunSummary } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/project/store";
import { useNotificationStore, type AlertPrefs } from "@/lib/notifications/store";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });
}

function initials(email: string, name: string | null) {
  if (name) return name.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function CopyField({ label, value }: { label: string; value: string }) {
  function copy() {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={copy}>
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

const ROLE_DESC: Record<string, string> = {
  admin: "Full access — manage members, settings, and run tests",
  developer: "Run tests, create and edit test cases",
  viewer: "Read-only access to runs and reports",
};

export default function ProjectSettingsPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const currentProject = useProjectStore((s) => s.currentProject);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const [tab, setTab] = useState("overview");
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ pass_rate: number; total_runs: number; active_runs: number; test_case_count: number; cost_this_month_usd: number } | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { getAlertPrefs, setAlertPrefs } = useNotificationStore();
  const alertPrefs: AlertPrefs = projectId ? getAlertPrefs(projectId) : { onFailure: true, onSuccess: false, passRateThreshold: null };

  function updatePref<K extends keyof AlertPrefs>(key: K, value: AlertPrefs[K]) {
    if (!projectId) return;
    setAlertPrefs(projectId, { ...alertPrefs, [key]: value });
  }

  const [addOpen, setAddOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [addingMember, setAddingMember] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [proj, m] = await Promise.all([
        apiClient.getProject(projectId),
        apiClient.getProjectMembers(projectId),
      ]);
      setProject(proj);
      setMembers(m.members);
      setEditName(proj.name);
      setEditDesc(proj.description ?? "");
      // Non-blocking — stats and runs load after
      apiClient.getProjectStats(projectId).then(setStats).catch(() => {});
      apiClient.getProjectRuns(projectId).then((r) => setRecentRuns(r.runs.slice(0, 5))).catch(() => {});
    } catch {
      toast.error("Failed to load project details");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) { router.push("/app"); return; }
    load();
  }, [projectId, load, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    try {
      const updated = await apiClient.updateProject(projectId, {
        name: editName,
        description: editDesc || undefined,
      });
      setProject(updated);
      if (currentProject) setCurrentProject({ ...currentProject, name: updated.name });
      toast.success("Project saved");
    } catch {
      toast.error("Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!projectId) return;
    if (!confirm(`Archive "${project?.name}"? It will be hidden from the project list. Test cases and runs are preserved.`)) return;
    try {
      await apiClient.archiveProject(projectId);
      setCurrentProject(null);
      toast.success("Project archived");
      router.push("/app");
    } catch (err) {
      const msg = String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("active run")) {
        toast.error("Cancel all active runs before archiving this project.");
      } else {
        toast.error("Failed to archive project");
      }
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !memberEmail.trim()) return;
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
    } catch (err) {
      toast.error(String(err).includes("409") ? "Already a member" : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    if (!projectId) return;
    try {
      const updated = await apiClient.updateProjectMember(projectId, memberId, { role });
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
    } catch (err) {
      const msg = String(err);
      toast.error(msg.includes("last admin") ? "Cannot remove the last admin from a project." : "Failed to update role");
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!projectId) return;
    try {
      await apiClient.removeProjectMember(projectId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch (err) {
      const msg = String(err);
      toast.error(msg.includes("last admin") ? "Cannot remove the last admin from a project." : "Failed to remove member");
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
        title="Project settings"
        subtitle={project.name}
        breadcrumbs={[{ label: "Settings" }, { label: "Project" }]}
      />

      {/* Tab bar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-muted/25 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9">
              <TabsTrigger value="overview" className="gap-1.5 px-4 text-xs sm:text-sm">
                <Activity className="size-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="general" className="px-4 text-xs sm:text-sm">General</TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5 px-4 text-xs sm:text-sm">
                <Users className="size-3.5" />
                Members
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{members.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5 px-4 text-xs sm:text-sm">
                <Bell className="size-3.5" />
                Alerts
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* ── Overview ─────────────────────────────────────────── */}
          {tab === "overview" && (
            <>
              {/* Stats cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Total runs",
                    value: stats ? String(stats.total_runs) : "—",
                    icon: <Activity className="size-4" />,
                    color: "text-primary bg-primary/10",
                  },
                  {
                    label: "Pass rate",
                    value: stats && stats.total_runs > 0 ? `${Math.round(stats.pass_rate * 100)}%` : "—",
                    icon: <CheckCircle2 className="size-4" />,
                    color: stats && stats.pass_rate >= 0.8 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10",
                  },
                  {
                    label: "Test cases",
                    value: stats ? String(stats.test_case_count) : "—",
                    icon: <FlaskConical className="size-4" />,
                    color: "text-violet-400 bg-violet-500/10",
                  },
                  {
                    label: "Cost this month",
                    value: stats ? `$${stats.cost_this_month_usd.toFixed(2)}` : "—",
                    icon: <Zap className="size-4" />,
                    color: "text-amber-400 bg-amber-500/10",
                  },
                ].map((s) => (
                  <Card key={s.label} className="border-border/60 bg-card/50">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/60 ${s.color}`}>
                        {s.icon}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Recent runs */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Recent runs</CardTitle>
                  <CardDescription className="text-xs">Last 5 runs across all test cases in this project.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {recentRuns.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">No runs yet for this project.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/60 hover:bg-transparent">
                          <TableHead className="text-xs">Run</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Duration</TableHead>
                          <TableHead className="text-xs">Steps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentRuns.map((r) => (
                          <TableRow key={r.run_id} className="border-border/60 cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/app/${projectId}/artifacts/${r.run_id}`)}>
                            <TableCell>
                              <p className="text-sm font-medium truncate max-w-[200px]">{r.test_name ?? r.run_id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground font-mono">{r.run_id.slice(0, 8)}</p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  r.status === "passed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                                  r.status === "failed" ? "border-rose-500/30 bg-rose-500/10 text-rose-400" :
                                  r.status === "running" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                                  "border-border/60 text-muted-foreground"
                                }
                              >
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.duration_s != null ? `${r.duration_s.toFixed(1)}s` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.total_steps ?? "—"}
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

          {/* ── General ──────────────────────────────────────────── */}
          {tab === "general" && (
            <>
              {/* Identity */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Project identity</CardTitle>
                  <CardDescription className="text-xs">
                    Use the Project ID and slug in CI/CD pipelines and API calls.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CopyField label="Project ID" value={project.id} />
                  <CopyField label="Slug" value={project.slug} />
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(project.created_at)}
                  </div>
                </CardContent>
              </Card>

              {/* Edit */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Project details</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="proj-name">Name</Label>
                      <Input
                        id="proj-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="My project"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="proj-desc">Description</Label>
                      <Textarea
                        id="proj-desc"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="What does this project test?"
                        className="resize-none"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown on the project card and in reports.
                      </p>
                    </div>
                    <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save changes
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Docs */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Documentation</CardTitle>
                  <CardDescription className="text-xs">
                    Attach runbooks, architecture notes, or testing guides to this project.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Mock doc entries */}
                  {[
                    { title: "Testing strategy", type: "Runbook", url: "#" },
                    { title: "Environment setup guide", type: "Guide", url: "#" },
                  ].map((doc) => (
                    <div
                      key={doc.title}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium leading-tight">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">{doc.type}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-50 cursor-not-allowed" disabled>
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </div>
                  ))}

                  {/* Upload placeholder */}
                  <button
                    type="button"
                    disabled
                    className={cn(
                      "w-full rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-5",
                      "flex flex-col items-center gap-1.5 text-center opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Upload className="size-5 text-muted-foreground" />
                    <p className="text-xs font-medium">Attach a document</p>
                    <p className="text-[11px] text-muted-foreground">PDF, Markdown, or link — coming soon</p>
                  </button>
                </CardContent>
              </Card>

              {/* Danger zone */}
              <Card className="border-rose-500/20 bg-rose-500/5">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-rose-400">Danger zone</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Separator className="bg-rose-500/10" />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Archive this project</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Hides the project from the project list. All test cases, runs,
                        and vault secrets are preserved and can be restored.
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" className="shrink-0" onClick={handleArchive}>
                      <Trash2 className="mr-1.5 size-3.5" /> Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Alerts ───────────────────────────────────────────── */}
          {tab === "alerts" && (
            <>
              <div>
                <h2 className="text-sm font-semibold">Alert preferences</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Control which in-app notifications you receive for this project.
                </p>
              </div>

              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Run notifications</CardTitle>
                  <CardDescription className="text-xs">
                    Get notified in the bell menu when runs complete.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Notify on failure</p>
                      <p className="text-xs text-muted-foreground">
                        Fires when a run ends with status failed, errored, timed out, or blocked.
                      </p>
                    </div>
                    <Switch
                      checked={alertPrefs.onFailure}
                      onCheckedChange={(v) => updatePref("onFailure", v)}
                    />
                  </div>
                  <Separator className="bg-border/40" />
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Notify on success</p>
                      <p className="text-xs text-muted-foreground">
                        Fires when a run ends with status passed.
                      </p>
                    </div>
                    <Switch
                      checked={alertPrefs.onSuccess}
                      onCheckedChange={(v) => updatePref("onSuccess", v)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Pass-rate threshold</CardTitle>
                  <CardDescription className="text-xs">
                    Get a warning notification when the project pass rate drops below a threshold.
                    Leave blank to disable.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="e.g. 80"
                      className="w-28"
                      value={alertPrefs.passRateThreshold ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value)));
                        updatePref("passRateThreshold", v);
                      }}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  {alertPrefs.passRateThreshold !== null && (
                    <p className="text-xs text-amber-400">
                      You will be notified when the pass rate drops below {alertPrefs.passRateThreshold}%.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-muted/10">
                <CardContent className="flex items-start gap-3 p-4">
                  <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">
                    Notifications are stored locally in your browser. Email and Slack alerts are
                    configured in <strong>Settings → Integrations</strong>.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Members ──────────────────────────────────────────── */}
          {tab === "members" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Team members</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Control who can access this project and what they can do.
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" /> Add member
                </Button>
              </div>

              {/* Role legend */}
              <Card className="border-border/60 bg-card/50">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
                  {Object.entries(ROLE_DESC).map(([role, desc]) => (
                    <div key={role} className="space-y-1">
                      <Badge
                        variant="outline"
                        className={
                          role === "admin" ? "border-violet-500/30 bg-violet-500/10 text-violet-400" :
                          role === "developer" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                          "border-slate-500/30 bg-slate-500/10 text-slate-400"
                        }
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Member table */}
              <Card className="border-border/60 bg-card/50">
                <CardContent className="p-0">
                  {members.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <Users className="size-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium">No members yet</p>
                      <p className="text-xs text-muted-foreground">Add your first team member to collaborate on this project.</p>
                      <Button size="sm" className="mt-2 gap-1.5" onClick={() => setAddOpen(true)}>
                        <Plus className="size-3.5" /> Add member
                      </Button>
                    </div>
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
                                <Avatar className="size-8 rounded-lg border border-border/60">
                                  <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                                    {initials(m.user_email, m.user_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  {m.user_name && (
                                    <p className="truncate text-sm font-medium leading-tight">{m.user_name}</p>
                                  )}
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
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(m.added_at)}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                  <MoreVertical className="size-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-rose-400 focus:text-rose-400"
                                    onClick={() => handleRemoveMember(m.id)}
                                  >
                                    <Trash2 className="mr-2 size-3.5" /> Remove from project
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
            </>
          )}

        </div>
      </main>

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={handleAddMember}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="mem-email">Email address *</Label>
                <Input
                  id="mem-email"
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-name">Display name <span className="text-muted-foreground">(optional)</span></Label>
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
                    <SelectItem value="developer">Developer — run & edit tests</SelectItem>
                    <SelectItem value="viewer">Viewer — read only</SelectItem>
                  </SelectContent>
                </Select>
                {memberRole && (
                  <p className="text-xs text-muted-foreground">{ROLE_DESC[memberRole]}</p>
                )}
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
