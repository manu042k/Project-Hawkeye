"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, MoreVertical, Plus, Search, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { apiClient, type VaultSecret } from "@/lib/api/client";
import { useProjectStore } from "@/lib/project/store";
import { cn } from "@/lib/utils";
const ENV_OPTIONS = ["All Environments", "Production", "Staging", "Development"] as const;
const TYPE_OPTIONS = ["All Types", "API Key", "Database", "Certificate", "Other"] as const;

function EnvBadge({ env }: { env: string }) {
  const cfg =
    env === "Production"
      ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
      : env === "Staging"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium", cfg)}>{env}</span>
  );
}

export default function VaultPage() {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? "default");
  const [q, setQ] = useState("");
  const [env, setEnv] = useState("All Environments");
  const [typ, setTyp] = useState("All Types");
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newEnv, setNewEnv] = useState("Development");
  const [newType, setNewType] = useState("API Key");
  const [adding, setAdding] = useState(false);

  function loadSecrets() {
    apiClient.listSecrets(projectId)
      .then((res) => setSecrets(res.secrets))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadSecrets(); }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return secrets.filter((s) => {
      if (env !== "All Environments" && s.environment !== env) return false;
      if (typ !== "All Types" && s.type !== typ) return false;
      if (query && !(s.name + " " + s.environment + " " + s.type).toLowerCase().includes(query)) return false;
      return true;
    });
  }, [q, env, typ, secrets]);

  async function handleReveal(secret: VaultSecret) {
    if (revealedValues[secret.id] !== undefined) {
      setRevealedValues((r) => { const n = { ...r }; delete n[secret.id]; return n; });
      return;
    }
    try {
      const res = await apiClient.revealSecret(projectId, secret.id);
      setRevealedValues((r) => ({ ...r, [secret.id]: res.value ?? "" }));
    } catch {
      toast.error("Failed to reveal secret");
    }
  }

  async function handleCopy(secret: VaultSecret) {
    try {
      let val = revealedValues[secret.id];
      if (val === undefined) {
        const res = await apiClient.revealSecret(projectId, secret.id);
        val = res.value ?? "";
      }
      await navigator.clipboard.writeText(val);
      toast.success("Copied", { description: `${secret.name} copied to clipboard.` });
    } catch {
      toast.error("Copy failed", { description: "Clipboard permission denied." });
    }
  }

  async function handleDelete(secret: VaultSecret) {
    try {
      await apiClient.deleteSecret(projectId, secret.id);
      setSecrets((prev) => prev.filter((s) => s.id !== secret.id));
      toast.success(`Deleted "${secret.name}"`);
    } catch {
      toast.error("Failed to delete secret");
    }
  }

  async function handleAdd() {
    if (!newName.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      await apiClient.createSecret(projectId, {
        name: newName.trim(),
        value: newValue.trim(),
        environment: newEnv,
        type: newType,
      });
      setNewName(""); setNewValue(""); setShowAdd(false);
      loadSecrets();
      toast.success("Secret added");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("409") ? "A secret with that name already exists" : "Failed to add secret");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="The Vault" subtitle="Secrets and credentials for this workspace." />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
              <div className="relative md:col-span-6">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-9" placeholder="Search secrets…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="md:col-span-3">
                <Select value={env} onValueChange={(v) => v && setEnv(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENV_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Select value={typ} onValueChange={(v) => v && setTyp(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="shrink-0 lg:self-center" onClick={() => setShowAdd(true)}>
              <Plus className="size-4" />
              Add secret
            </Button>
          </div>

          {showAdd && (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="space-y-4 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input placeholder="MY_SECRET_KEY" value={newName} onChange={(e) => setNewName(e.target.value)} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <Input type="password" placeholder="sk_live_…" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Environment</Label>
                    <Select value={newEnv} onValueChange={(v) => v && setNewEnv(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Development","Staging","Production"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["API Key","Database","Certificate","Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdd} disabled={adding || !newName.trim() || !newValue.trim()}>
                    {adding ? "Adding…" : "Add secret"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>
          )}

          <Card className="border-border/60 bg-card/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Secret Name</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          {secrets.length === 0 ? "No secrets yet. Click \"Add secret\" to get started." : "No secrets match your filters."}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((s) => {
                      const revealed = revealedValues[s.id];
                      const isRevealed = revealed !== undefined;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.name}</TableCell>
                          <TableCell><EnvBadge env={s.environment} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.type}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-mono text-sm tracking-[0.2em]">
                                {isRevealed ? revealed : s.masked_value}
                              </span>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleReveal(s)}
                                aria-label={isRevealed ? "Hide" : "Reveal"}
                              >
                                {isRevealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(s.updated_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleCopy(s)}
                                aria-label="Copy secret"
                              >
                                <Copy className="size-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  aria-label="More actions"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <MoreVertical className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleCopy(s)}>Copy value</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDelete(s)}
                                  >
                                    <Trash2 className="size-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
