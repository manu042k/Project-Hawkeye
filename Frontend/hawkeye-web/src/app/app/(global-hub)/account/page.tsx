"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleCheck, Link2, LogOut, Mail, MoreVertical, Pencil, ShieldCheck, User, UserPlus, XCircle } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { teamMembers } from "@/lib/mock-data/billing";
import { cn } from "@/lib/utils";

type ConnectedProvider = {
  id: "google" | "github";
  label: string;
  status: "connected" | "not_connected";
};

export default function AccountPage() {
  const { data: session, status } = useSession();

  // Demo-first defaults (if user isn't actually signed in yet).
  const initialName = session?.user?.name ?? "Alex Mitchell";
  const initialEmail = session?.user?.email ?? "alex@techflow.pro";

  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const providers = useMemo<ConnectedProvider[]>(
    () => [
      { id: "google", label: "Google", status: session ? "connected" : "not_connected" },
      { id: "github", label: "GitHub", status: session ? "connected" : "not_connected" },
    ],
    [session]
  );

  const avatarFallback = (fullName || "User")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  function onSaveProfile() {
    toast.success("Profile updated", { description: "Static demo: changes are not persisted to a backend." });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Account"
        subtitle="Profile, team, security, and connected providers"
        rightSlot={
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              variant="outline"
              className="h-9"
              onClick={() => {
                if (status === "authenticated") signOut({ callbackUrl: "/" });
                else window.location.href = "/auth/login";
              }}
            >
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              {status === "authenticated" ? "Sign out" : "Go to sign in"}
            </Button>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[900px] space-y-6">
          <Card id="overview" className="scroll-mt-28 border-border/60 bg-card/40">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="size-12">
                  <AvatarImage src={session?.user?.image ?? ""} alt={fullName} />
                  <AvatarFallback>{avatarFallback}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-xl tracking-tight">{fullName}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                    {email}
                    {status === "authenticated" ? (
                      <Badge variant="secondary" className="ml-1">
                        Signed in
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1">
                        Demo
                      </Badge>
                    )}
                  </CardDescription>
                </div>
              </div>

              <Link
                href="/app/billing"
                className={cn(buttonVariants({ variant: "secondary" }), "justify-center")}
              >
                Manage plan
              </Link>
            </CardHeader>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="profile" className="scroll-mt-28 border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-4 text-primary" aria-hidden="true" />
                  Profile
                </CardTitle>
                <CardDescription>Update your basic account details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Display name</div>
                    <div className="text-xs text-muted-foreground">Shown in dashboards, runs, and audit trails.</div>
                  </div>
                  <Button variant="outline" className="h-9" onClick={onSaveProfile}>
                    <Pencil className="mr-2 size-4" aria-hidden="true" />
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card id="security" className="scroll-mt-28 border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  Security
                </CardTitle>
                <CardDescription>Improve protection for your account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-card/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Multi-factor authentication</div>
                    <div className="text-xs text-muted-foreground">Require a second factor at sign-in.</div>
                  </div>
                  <Switch checked={mfaEnabled} onCheckedChange={(v) => setMfaEnabled(!!v)} />
                </div>
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-card/50 p-4">
                  <div>
                    <div className="text-sm font-medium">Security alerts</div>
                    <div className="text-xs text-muted-foreground">Email alerts for suspicious sign-ins.</div>
                  </div>
                  <Switch checked={securityAlerts} onCheckedChange={(v) => setSecurityAlerts(!!v)} />
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full justify-center"
                  onClick={() => toast("Password reset", { description: "Use the password recovery screen in this demo." })}
                >
                  <Link2 className="mr-2 size-4" aria-hidden="true" />
                  Reset password
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card id="providers" className="scroll-mt-28 border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" aria-hidden="true" />
                Connected providers
              </CardTitle>
              <CardDescription>Manage your SSO connections (Google, GitHub).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 p-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {p.status === "connected" ? (
                          <>
                            <CircleCheck className="size-4 text-emerald-500" aria-hidden="true" /> Connected
                          </>
                        ) : (
                          <>
                            <XCircle className="size-4 text-muted-foreground" aria-hidden="true" /> Not connected
                          </>
                        )}
                      </div>
                    </div>

                    <Button
                      variant={p.status === "connected" ? "secondary" : "outline"}
                      className="h-9"
                      onClick={() =>
                        toast(p.status === "connected" ? "Disconnected" : "Connect provider", {
                          description: "In the demo, connections are managed by NextAuth provider sign-in.",
                        })
                      }
                    >
                      {p.status === "connected" ? "Manage" : "Connect"}
                    </Button>
                  </div>
                ))}
              </div>

              <Separator className="bg-border/60" />

              <div className="text-xs text-muted-foreground">
                Note: when SSO is configured, signing in with Google/GitHub establishes a session and unlocks the `/app/*` routes.
              </div>
            </CardContent>
          </Card>

          <Card id="team" className="scroll-mt-28 border-border/60 bg-card/40 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="size-4 text-primary" aria-hidden="true" />
                  Team management
                </CardTitle>
                <CardDescription className="mt-1.5">People in your organization and their roles.</CardDescription>
              </div>

              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  Invite
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a teammate</DialogTitle>
                    <DialogDescription>Static UI demo. Invites are not actually sent.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        toast.success("Invite queued", { description: inviteEmail || "Invite created." });
                        setInviteEmail("");
                        setInviteOpen(false);
                      }}
                    >
                      Send invite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {teamMembers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/20">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-8 border border-border/60">
                        {m.avatarUrl ? <AvatarImage alt={m.name} src={m.avatarUrl} /> : null}
                        <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                          {m.initials ?? m.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{m.role}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="Member actions"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreVertical className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toast.message("Action", { description: "Role editing disabled in demo." })}>
                            Change role
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => toast.message("Action", { description: "Removal disabled in demo." })}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

