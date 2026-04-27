"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import type { UsageMeter } from "@/lib/mock-data/billing";
import { subscription, usageMeters, usagePeriodLabel } from "@/lib/mock-data/billing";
import { cn } from "@/lib/utils";

function meterPct(m: UsageMeter) {
  return Math.min(100, Math.round((m.used / m.limit) * 100));
}

function formatUsed(m: UsageMeter) {
  if (m.unit === "GB") return m.used.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return m.used.toLocaleString();
}

function formatLimit(m: UsageMeter) {
  if (m.unit === "GB") return m.limit.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return m.limit.toLocaleString();
}

export default function BillingPage() {
  const [tab, setTab] = useState("Billing");
  const [fullName, setFullName] = useState("Alex Mitchell");
  const [email, setEmail] = useState("alex@techflow.pro");

  const primaryMeter = usageMeters[0];
  const runsPct = meterPct(primaryMeter);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Billing"
        subtitle="Usage, subscription, and billing profile"
        rightSlot={
          <div className="hidden items-center gap-3 lg:flex">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input placeholder="Search..." className="pl-9" />
            </div>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
              <p className="mt-2 text-muted-foreground">
                Track organization usage against your plan, manage subscription billing, and update your billing profile.
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

          <Card id="usage" className="scroll-mt-28 border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Usage details</CardTitle>
              <CardDescription>{usagePeriodLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 p-6">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary quota</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight">{primaryMeter.label}</p>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground">
                    {subscription.usage.used.toLocaleString()} / {subscription.usage.limit.toLocaleString()}{" "}
                    <span className="text-muted-foreground/80">runs</span>
                  </p>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-muted">
                  <div className={cn("h-2 rounded-full bg-primary transition-all")} style={{ width: `${runsPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  You have used <span className="font-medium text-foreground">{runsPct}%</span> of included test runs this period.
                  Overage billing applies per your Enterprise agreement if you exceed the limit.
                </p>
              </div>

              <div className="grid gap-6">
                {usageMeters.slice(1).map((m) => {
                  const pct = meterPct(m);
                  return (
                    <div key={m.id} className="space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{m.label}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{m.description}</div>
                        </div>
                        <span className="font-mono text-sm text-muted-foreground">
                          {formatUsed(m)} / {formatLimit(m)} {m.unit}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary/90" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{pct}% of allocation</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
                Figures are illustrative for this demo. Connect usage metering to your backend for live rollups by project and environment.
              </p>
            </CardContent>
          </Card>

          <Card id="subscription" className="scroll-mt-28 border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60 flex flex-row items-start justify-between gap-4">
              <CardTitle>Subscription plan</CardTitle>
              <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400" variant="outline">
                Active
              </Badge>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">Current plan</div>
                  <div className="text-2xl font-semibold tracking-tight">{subscription.plan}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tracking-tight">
                    ${subscription.priceMonthly}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Next billing date: <span className="text-foreground/90">{subscription.nextBillingDate}</span>
                </div>
                <Button variant="outline" onClick={() => toast.message("Static UI demo", { description: "Billing portal not configured." })}>
                  Manage billing
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card id="profile" className="scroll-mt-28 border-border/60 bg-card/60 overflow-hidden">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Billing profile</CardTitle>
              <CardDescription>Name and email shown on invoices and receipts.</CardDescription>
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
                      <Label>Full name</Label>
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email address</Label>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => toast.success("Saved", { description: "Profile saved locally (static demo)." })}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
