"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";

const DEFAULT_PROJECT = "default";
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const WEBHOOK_URL = `${API_URL}/api/webhook/github`;

type Integration = { id: string; type: string; enabled: boolean; config: Record<string, unknown>; created_at: string };

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  // Slack form
  const [slackUrl, setSlackUrl] = useState("");
  const [showSlackUrl, setShowSlackUrl] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);

  // GitHub form
  const [ghRepo, setGhRepo] = useState("");
  const [ghInstallId, setGhInstallId] = useState("");
  const [ghBranch, setGhBranch] = useState("main");
  const [savingGh, setSavingGh] = useState(false);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/api/projects/${DEFAULT_PROJECT}/integrations`, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations ?? []);
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteIntegration(id: string) {
    try {
      await fetch(`${API_URL}/api/projects/${DEFAULT_PROJECT}/integrations/${id}`, { method: "DELETE" });
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      toast.success("Integration removed");
    } catch {
      toast.error("Failed to remove integration");
    }
  }

  async function saveSlack() {
    if (!slackUrl.trim()) return;
    setSavingSlack(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${DEFAULT_PROJECT}/integrations/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: slackUrl.trim(), notify_on: ["failure", "passed"] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setIntegrations((prev) => [...prev, data]);
      setSlackUrl("");
      toast.success("Slack integration saved");
    } catch {
      toast.error("Failed to save Slack integration");
    } finally {
      setSavingSlack(false);
    }
  }

  async function saveGitHub() {
    if (!ghRepo.trim() || !ghInstallId.trim()) return;
    setSavingGh(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${DEFAULT_PROJECT}/integrations/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: ghRepo.trim(), installation_id: Number(ghInstallId), branch: ghBranch.trim() || "main" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setIntegrations((prev) => [...prev, data]);
      setGhRepo(""); setGhInstallId(""); setGhBranch("main");
      toast.success("GitHub integration saved");
    } catch {
      toast.error("Failed to save GitHub integration");
    } finally {
      setSavingGh(false);
    }
  }

  const slackIntegrations = integrations.filter((i) => i.type === "slack");
  const githubIntegrations = integrations.filter((i) => i.type === "github");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Integrations" subtitle="Webhooks and third-party connections for this workspace." />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">

          {/* GitHub webhook (inbound) */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle>GitHub Actions Webhook</CardTitle>
              <CardDescription>Trigger suite runs on push events from your CI/CD pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Inbound webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input className="h-10 font-mono text-sm" value={WEBHOOK_URL} readOnly />
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); toast.success("Copied!"); }}>
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set <code className="font-mono bg-muted px-1 rounded">GITHUB_WEBHOOK_SECRET</code> on the API server to enable signature verification.
                </p>
              </div>

              {/* GitHub app (outbound Check Run) */}
              <div className="border-t border-border/60 pt-4 space-y-3">
                <p className="text-sm font-medium">GitHub App — outbound Check Runs</p>
                {!loading && githubIntegrations.length > 0 && (
                  <div className="space-y-2">
                    {githubIntegrations.map((i) => (
                      <div key={i.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-mono truncate">{String(i.config.repo)}</p>
                          <p className="text-xs text-muted-foreground">branch: {String(i.config.branch ?? "main")}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-rose-400" onClick={() => deleteIntegration(i.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Repo (org/repo)</Label>
                    <Input placeholder="acme/web-app" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} className="h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Installation ID</Label>
                    <Input placeholder="12345678" value={ghInstallId} onChange={(e) => setGhInstallId(e.target.value)} className="h-9 text-sm font-mono" />
                  </div>
                  <Button size="sm" className="h-9" disabled={savingGh || !ghRepo.trim() || !ghInstallId.trim()} onClick={saveGitHub}>
                    {savingGh ? "Saving…" : "Add"}
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Branch filter</Label>
                  <Input placeholder="main" value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} className="h-9 text-sm font-mono max-w-[180px]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Slack */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Slack</CardTitle>
                <CardDescription>Receive pass/fail notifications in a Slack channel.</CardDescription>
              </div>
              <Badge
                variant="outline"
                className={slackIntegrations.length > 0
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                  : ""}
              >
                {slackIntegrations.length > 0 ? "CONNECTED" : "NOT CONNECTED"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {!loading && slackIntegrations.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
                  <p className="text-sm font-mono truncate text-muted-foreground">{String(i.config.webhook_url ?? "").slice(0, 50)}…</p>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-rose-400" onClick={() => deleteIntegration(i.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Webhook URL</Label>
                <div className="relative">
                  <Input
                    className="h-10 pr-10 font-mono text-sm"
                    type={showSlackUrl ? "text" : "password"}
                    placeholder="https://hooks.slack.com/services/T…"
                    value={slackUrl}
                    onChange={(e) => setSlackUrl(e.target.value)}
                  />
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowSlackUrl((v) => !v)}>
                    {showSlackUrl ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
              <Button size="sm" disabled={savingSlack || !slackUrl.trim()} onClick={saveSlack}>
                {savingSlack ? "Saving…" : "Save Slack webhook"}
              </Button>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
