"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Loader2, MailPlus, MoreVertical, Plus, Save, Trash2, Users,
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const ORG_ID = "default";

type OrgMember = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: string;
  joined_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
};

const ROLE_COLORS: Record<string, string> = {
  owner: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  admin: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  developer: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  viewer: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

function initials(email: string, name?: string) {
  if (name && name.trim()) return name.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OrgSettingsPage() {
  const [tab, setTab] = useState("general");
  const [loading, setLoading] = useState(true);

  const [orgName, setOrgName] = useState("");
  const [orgBillingEmail, setOrgBillingEmail] = useState("");
  const [orgPlan, setOrgPlan] = useState("free");
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [org, mem, inv] = await Promise.all([
        apiClient.getOrg(ORG_ID),
        apiClient.listMembers(ORG_ID),
        apiClient.listInvitations(ORG_ID),
      ]);
      setOrgName(org.name);
      setOrgBillingEmail(org.billing_email ?? "");
      setOrgPlan(org.plan);
      setMembers(mem.members);
      setInvitations(inv.invitations);
    } catch {
      toast.error("Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.updateOrg(ORG_ID, { name: orgName, billing_email: orgBillingEmail || undefined });
      toast.success("Organization saved");
    } catch {
      toast.error("Failed to save organization");
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await apiClient.updateMemberRole(ORG_ID, userId, role);
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await apiClient.removeMember(ORG_ID, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const inv = await apiClient.inviteMember(ORG_ID, { email: inviteEmail.trim(), role: inviteRole });
      setInvitations((prev) => [...prev, inv]);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("developer");
      toast.success(`Invitation sent to ${inv.email}`);
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvitation(invId: string) {
    try {
      await apiClient.revokeInvitation(ORG_ID, invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
      toast.success("Invitation revoked");
    } catch {
      toast.error("Failed to revoke invitation");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Organization"
        subtitle={orgName}
        breadcrumbs={[{ label: "Settings" }, { label: "Organization" }]}
      />

      {/* Tab bar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-muted/25 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9">
              <TabsTrigger value="general" className="gap-1.5 px-4 text-xs sm:text-sm">
                <Building2 className="size-3.5" />
                General
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5 px-4 text-xs sm:text-sm">
                <Users className="size-3.5" />
                Members
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{members.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="invitations" className="gap-1.5 px-4 text-xs sm:text-sm">
                <MailPlus className="size-3.5" />
                Invitations
                {invitations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{invitations.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* ── General ─────────────────────────────────────────── */}
          {tab === "general" && (
            <>
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Organization details</CardTitle>
                  <CardDescription className="text-xs">
                    Update your organization name and billing contact.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveGeneral} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="org-name">Organization name</Label>
                      <Input
                        id="org-name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Acme Corp"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="billing-email">Billing email <span className="text-muted-foreground">(optional)</span></Label>
                      <Input
                        id="billing-email"
                        type="email"
                        value={orgBillingEmail}
                        onChange={(e) => setOrgBillingEmail(e.target.value)}
                        placeholder="billing@company.com"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                      {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save changes
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Plan</CardTitle>
                  <CardDescription className="text-xs">Your current subscription tier.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-sm px-3 py-1",
                      orgPlan === "enterprise" ? "border-violet-500/30 bg-violet-500/10 text-violet-400" :
                      orgPlan === "team" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                      orgPlan === "pro" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                      "border-border/60 text-muted-foreground"
                    )}
                  >
                    {orgPlan}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Manage your plan and billing in <a href="/app/billing" className="underline hover:text-foreground">Billing</a>.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Members ─────────────────────────────────────────── */}
          {tab === "members" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Organization members</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    People with access to this organization.
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                  <Plus className="size-3.5" /> Invite member
                </Button>
              </div>

              <Card className="border-border/60 bg-card/50">
                <CardContent className="p-0">
                  {members.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <Users className="size-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium">No members yet</p>
                      <Button size="sm" className="mt-2 gap-1.5" onClick={() => setInviteOpen(true)}>
                        <Plus className="size-3.5" /> Invite member
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/60 hover:bg-transparent">
                          <TableHead className="text-xs">Member</TableHead>
                          <TableHead className="text-xs">Role</TableHead>
                          <TableHead className="text-xs">Joined</TableHead>
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
                                    {initials(m.email, m.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium leading-tight">{m.name || m.email}</p>
                                  {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={m.role}
                                onValueChange={(v) => { if (v) handleRoleChange(m.id, v); }}
                                disabled={m.role === "owner"}
                              >
                                <SelectTrigger className="h-7 w-32 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="owner">Owner</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="developer">Developer</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(m.joined_at)}
                            </TableCell>
                            <TableCell>
                              {m.role !== "owner" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                    <MoreVertical className="size-3.5" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="text-rose-400 focus:text-rose-400"
                                      onClick={() => handleRemoveMember(m.id)}
                                    >
                                      <Trash2 className="mr-2 size-3.5" /> Remove from org
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
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

          {/* ── Invitations ─────────────────────────────────────── */}
          {tab === "invitations" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Pending invitations</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invitations that have been sent but not yet accepted.
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                  <MailPlus className="size-3.5" /> Invite
                </Button>
              </div>

              <Card className="border-border/60 bg-card/50">
                <CardContent className="p-0">
                  {invitations.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <MailPlus className="size-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium">No pending invitations</p>
                      <p className="text-xs text-muted-foreground">Invite people to join your organization.</p>
                      <Button size="sm" className="mt-2 gap-1.5" onClick={() => setInviteOpen(true)}>
                        <Plus className="size-3.5" /> Invite member
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/60 hover:bg-transparent">
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Role</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invitations.map((inv) => (
                          <TableRow key={inv.id} className="border-border/60">
                            <TableCell className="text-sm font-medium">{inv.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("capitalize text-xs", ROLE_COLORS[inv.role] ?? "")}>
                                {inv.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs border-amber-500/30 bg-amber-500/10 text-amber-400">
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs text-rose-400 hover:text-rose-400 hover:bg-rose-500/10"
                                onClick={() => handleRevokeInvitation(inv.id)}
                              >
                                <Trash2 className="size-3" /> Revoke
                              </Button>
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

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite to organization</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email address *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => { if (v) setInviteRole(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — manage members and settings</SelectItem>
                    <SelectItem value="developer">Developer — run and edit tests</SelectItem>
                    <SelectItem value="viewer">Viewer — read only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
