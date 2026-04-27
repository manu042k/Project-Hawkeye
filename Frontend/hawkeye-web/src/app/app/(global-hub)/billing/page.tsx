"use client";

import { useMemo, useState } from "react";
import { MoreVertical, Search, UserPlus } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { subscription, teamMembers } from "@/lib/mock-data/billing";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function BillingPage() {
  const [tab, setTab] = useState("Billing");
  const [fullName, setFullName] = useState("Alex Mitchell");
  const [email, setEmail] = useState("alex@techflow.pro");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const usagePct = useMemo(() => Math.round((subscription.usage.used / subscription.usage.limit) * 100), []);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        title="Billing"
        rightSlot={
          <div className="hidden items-center gap-3 lg:flex">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Search..." className="pl-9" />
            </div>
          </div>
        }
      />

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
              <p className="mt-2 text-muted-foreground">
                Manage your subscription, usage, invoices, and team plan settings.
              </p>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="Profile">Profile</TabsTrigger>
                <TabsTrigger value="Billing">Billing</TabsTrigger>
                <TabsTrigger value="Security">Security</TabsTrigger>
                <TabsTrigger value="Notifications">Notifications</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Card className="border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Personal Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex items-start gap-4">
                  <Avatar className="size-16 rounded-lg border border-border/60">
                    <AvatarImage
                      alt="Profile"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPL9oJVKDDdhxT1u2zyach_YTCiF6C5O9ZIwtVxJ7T6pr4S2zSgj66x3bqiU1Xt4urLpaA6HaMTB7Ad87JdS9MNFCDUxDqXLpcx5YNoZ7iv6E5M8B55bSNEffUfEKiamIr5yxLMfuOeT1JrCEHIlv2pDFNlOw-IAhm9upDVGwiyVWg4b1F3vFeryM4MBBOJdbKqrNpTDkFrXbxyuyK2GXujizHEc2x-Wfa3-tGHHxBre-FY5cVNFe4UhiEn8zzWMwj_ZiVjnast-s"
                    />
                    <AvatarFallback>AM</AvatarFallback>
                  </Avatar>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => toast.success("Saved", { description: "Profile saved locally (static demo)." })}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60 flex flex-row items-center justify-between gap-4">
              <CardTitle>Team Management</CardTitle>

              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger className={cn(buttonVariants({ variant: "outline" }))}>
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
                  <li key={m.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8 border border-border/60">
                        {m.avatarUrl ? <AvatarImage alt={m.name} src={m.avatarUrl} /> : null}
                        <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                          {m.initials ?? m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">{m.role}</span>
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
                          <DropdownMenuItem className="text-destructive" onClick={() => toast.message("Action", { description: "Removal disabled in demo." })}>
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

          <Card className="border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60 flex flex-row items-start justify-between gap-4">
              <CardTitle>Subscription Plan</CardTitle>
              <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400" variant="outline">
                Active
              </Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">Current Plan</div>
                  <div className="text-2xl font-semibold tracking-tight">{subscription.plan}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tracking-tight">
                    ${subscription.priceMonthly}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Monthly Run Usage</span>
                  <span className="font-mono text-muted-foreground">
                    {subscription.usage.used.toLocaleString()} / {subscription.usage.limit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className={cn("h-2 rounded-full bg-primary")} style={{ width: `${usagePct}%` }} />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Next billing date: <span className="text-foreground/90">{subscription.nextBillingDate}</span>
                </div>
                <Button variant="outline" onClick={() => toast.message("Static UI demo", { description: "Billing portal not configured." })}>
                  Manage Billing
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

