"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { apiClient, type Environment } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export default function EnvironmentsPage() {
  const { projectId = "default" } = useParams<{ projectId: string }>();
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // new env form
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [headersRaw, setHeadersRaw] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.listEnvironments(projectId);
      setEnvs(res.environments);
    } catch {
      toast.error("Failed to load environments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  function parseHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
  }

  async function handleCreate() {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    try {
      const env = await apiClient.createEnvironment(projectId, {
        name: name.trim(),
        base_url: baseUrl.trim(),
        is_default: isDefault,
        headers: parseHeaders(headersRaw),
      });
      setEnvs((prev) => isDefault
        ? [...prev.map((e) => ({ ...e, is_default: false })), env]
        : [...prev, env]);
      setName(""); setBaseUrl(""); setIsDefault(false); setHeadersRaw("");
      setShowForm(false);
      toast.success("Environment created");
    } catch {
      toast.error("Failed to create environment");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await apiClient.updateEnvironment(projectId, id, { is_default: true });
      setEnvs((prev) => prev.map((e) => ({ ...e, is_default: e.id === id })));
      toast.success("Default environment updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.deleteEnvironment(projectId, id);
      setEnvs((prev) => prev.filter((e) => e.id !== id));
      toast.success("Environment deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  const selectCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const textareaCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Environments" subtitle="Target URLs and headers per environment." />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define environments (staging, production, etc.) to run tests against different base URLs.
            </p>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="size-3.5" /> Add environment
            </Button>
          </div>

          {/* Create form */}
          {showForm && (
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">New environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input placeholder="staging" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Base URL</Label>
                    <Input placeholder="https://staging.example.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Extra headers <span className="text-muted-foreground text-xs">(Key: Value, one per line)</span></Label>
                  <textarea value={headersRaw} onChange={(e) => setHeadersRaw(e.target.value)} rows={3}
                    className={textareaCls} placeholder={"X-Env: staging\nAuthorization: Bearer token"} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="size-4 rounded" />
                  <span className="text-sm">Set as default environment</span>
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button size="sm" disabled={saving || !name.trim() || !baseUrl.trim()} onClick={handleCreate}>
                    {saving ? "Creating…" : "Create"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Environment list */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl border border-border/60 bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : envs.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No environments yet. Add one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {envs.map((env) => (
                <div key={env.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-4 py-3.5",
                    env.is_default ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/50",
                  )}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{env.name}</span>
                      {env.is_default && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">Default</Badge>
                      )}
                    </div>
                    <p className="text-sm font-mono text-muted-foreground truncate">{env.base_url}</p>
                    {Object.keys(env.headers ?? {}).length > 0 && (
                      <p className="text-xs text-muted-foreground">{Object.keys(env.headers).length} custom header{Object.keys(env.headers).length !== 1 ? "s" : ""}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!env.is_default && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => handleSetDefault(env.id)}>
                        <Star className="size-3.5" /> Set default
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-rose-400" onClick={() => handleDelete(env.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
