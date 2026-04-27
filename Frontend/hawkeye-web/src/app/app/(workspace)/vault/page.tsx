"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, MoreVertical, Plus, Search } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

import { vaultSecrets, type VaultEnvironment, type VaultSecret, type VaultType } from "@/lib/mock-data/vault";
import { cn } from "@/lib/utils";

const envOptions = ["All Environments", "Production", "Staging", "Development"] as const;
const typeOptions = ["All Types", "Database", "API Key", "Certificate"] as const;

function EnvBadge({ env }: { env: VaultEnvironment }) {
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
  const [q, setQ] = useState("");
  const [env, setEnv] = useState<(typeof envOptions)[number]>("All Environments");
  const [typ, setTyp] = useState<(typeof typeOptions)[number]>("All Types");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return vaultSecrets.filter((s) => {
      if (env !== "All Environments" && s.environment !== env) return false;
      if (typ !== "All Types" && s.type !== (typ as VaultType)) return false;
      if (query && !(s.name + " " + s.environment + " " + s.type).toLowerCase().includes(query)) return false;
      return true;
    });
  }, [q, env, typ]);

  function toggleReveal(secret: VaultSecret) {
    setRevealed((r) => ({ ...r, [secret.id]: !r[secret.id] }));
  }

  async function copySecret(secret: VaultSecret) {
    try {
      await navigator.clipboard.writeText(secret.clearValue);
      toast.success("Copied", { description: `${secret.name} copied to clipboard.` });
    } catch {
      toast.error("Copy failed", { description: "Clipboard permission denied." });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="The Vault"
        subtitle="Securely manage environment variables and test credentials."
        rightSlot={
          <Button onClick={() => toast.message("Static UI demo", { description: "Secrets are not persisted in this build." })}>
            <Plus className="size-4" aria-hidden="true" />
            Add Secret
          </Button>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
            <div className="relative md:col-span-6">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                placeholder="Search secrets by name or key..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <Select value={env} onValueChange={(v) => v && setEnv(v as typeof env)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {envOptions.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3">
              <Select value={typ} onValueChange={(v) => v && setTyp(v as typeof typ)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="border-border/60 bg-card/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Secret Name</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s) => {
                      const isShown = !!revealed[s.id];
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.name}</TableCell>
                          <TableCell>
                            <EnvBadge env={s.environment} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-mono text-sm tracking-[0.2em]">
                                {isShown ? s.clearValue : s.maskedValue}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleReveal(s)}
                                aria-label={isShown ? "Hide value" : "Reveal value"}
                              >
                                <Eye className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{s.lastUpdated}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => copySecret(s)}
                                aria-label="Copy secret"
                              >
                                <Copy className="size-4" aria-hidden="true" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  aria-label="More actions"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <MoreVertical className="size-4" aria-hidden="true" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => toast.message("Edit", { description: "Edit dialog not implemented." })}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toast.message("Rotate", { description: "Rotation flow not implemented." })}>
                                    Rotate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => toast.message("Delete", { description: "Delete is disabled in static demo." })}>
                                    Delete
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

          {filtered.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No secrets match your filters.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}

