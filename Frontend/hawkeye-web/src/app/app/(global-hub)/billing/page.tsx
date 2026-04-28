"use client";

import { useEffect, useState } from "react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import type { UsageMeter } from "@/lib/mock-data/billing";
import { subscription, usageMeters, usagePeriodLabel } from "@/lib/mock-data/billing";
import { cn } from "@/lib/utils";

type BillingTab = "Profile" | "Billing" | "Security" | "Notifications";

function tabFromHash(raw: string): BillingTab | null {
  const h = raw.replace(/^#/, "");
  if (h === "usage" || h === "subscription") return "Billing";
  if (h === "profile") return "Profile";
  if (h === "billing-security") return "Security";
  if (h === "billing-notifications") return "Notifications";
  return null;
}

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
  const [tab, setTab] = useState<BillingTab>("Billing");
  const [fullName, setFullName] = useState("Alex Mitchell");
  const [email, setEmail] = useState("alex@techflow.pro");
  const [invoiceEmails, setInvoiceEmails] = useState(true);
  const [paymentAlerts, setPaymentAlerts] = useState(true);
  const [usageAlertEmails, setUsageAlertEmails] = useState(false);

  const primaryMeter = usageMeters[0];
  const runsPct = meterPct(primaryMeter);

  useEffect(() => {
    const syncTabFromHash = () => {
      const t = tabFromHash(typeof window !== "undefined" ? window.location.hash : "");
      if (t) setTab(t);
    };
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  useEffect(() => {
    const id = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!id) return;
    const t = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(t);
  }, [tab]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Billing" subtitle="Usage, subscription, and billing profile" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">
          <p className="text-sm text-muted-foreground">
            Organization usage, plan, invoice contact, and billing-related security and alerts.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as BillingTab)} className="w-full flex flex-col gap-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
              <TabsTrigger className="px-3" value="Billing">
                Billing
              </TabsTrigger>
              <TabsTrigger className="px-3" value="Profile">
                Profile
              </TabsTrigger>
              <TabsTrigger className="px-3" value="Security">
                Security
              </TabsTrigger>
              <TabsTrigger className="px-3" value="Notifications">
                Notifications
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "Billing" ? (
            <>
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
                    Figures are illustrative until usage metering is connected to your backend.
                  </p>
                </CardContent>
              </Card>

              <Card id="subscription" className="scroll-mt-28 border-border/60 bg-card/60 overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60">
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
                    <Button variant="outline" onClick={() => toast.message("Billing portal", { description: "Connect Stripe Customer Portal when backend is ready." })}>
                      Manage billing
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {tab === "Profile" ? (
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
                      <Button onClick={() => toast.success("Saved", { description: "Persist via API when backend is connected." })}>
                        Save changes
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "Security" ? (
            <Card id="billing-security" className="scroll-mt-28 border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Billing security</CardTitle>
                <CardDescription>Protect payment methods and billing portal access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  Require sign-in and MFA for the billing portal when your identity provider supports it. Payment methods are tokenized by the
                  processor—not stored in Hawkeye.
                </p>
                <Button variant="outline" onClick={() => toast.message("Billing portal", { description: "Wire SSO / MFA policies to your billing provider." })}>
                  Manage portal access
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {tab === "Notifications" ? (
            <Card id="billing-notifications" className="scroll-mt-28 border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Billing alerts</CardTitle>
                <CardDescription>Email preferences for invoices and payment events.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-background/30 p-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Invoice emails</div>
                    <div className="text-xs text-muted-foreground">PDF receipts and monthly statements.</div>
                  </div>
                  <Switch checked={invoiceEmails} onCheckedChange={(v) => setInvoiceEmails(!!v)} />
                </div>
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-background/30 p-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Payment failures</div>
                    <div className="text-xs text-muted-foreground">Alerts when a charge fails or a card expires.</div>
                  </div>
                  <Switch checked={paymentAlerts} onCheckedChange={(v) => setPaymentAlerts(!!v)} />
                </div>
                <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-background/30 p-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Usage thresholds</div>
                    <div className="text-xs text-muted-foreground">Notify when usage approaches plan limits.</div>
                  </div>
                  <Switch checked={usageAlertEmails} onCheckedChange={(v) => setUsageAlertEmails(!!v)} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => toast.success("Preferences saved", { description: "Hook to notification API when backend exists." })}>
                    Save preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}
