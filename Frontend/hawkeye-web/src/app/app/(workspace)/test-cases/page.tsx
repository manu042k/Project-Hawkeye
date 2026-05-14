"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Play, Plus, Search, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiClient, type TestCaseSummary } from "@/lib/api/client";
import { NewRunModal } from "@/components/app/new-run-modal";

const DEFAULT_PROJECT = "default";

const PRIORITY_COLORS: Record<string, string> = {
  P0: "border-red-500/40 bg-red-500/10 text-red-400",
  P1: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  P2: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  P3: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

export default function TestCasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runTcId, setRunTcId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function load(query = "") {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listProjectTestCases(DEFAULT_PROJECT, { status: "all", q: query });
      setCases(res.test_cases);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load test cases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleClone(tcId: string) {
    await apiClient.cloneProjectTestCase(DEFAULT_PROJECT, tcId);
    load();
  }

  async function confirmArchive() {
    if (!archiveId) return;
    setArchiving(true);
    try {
      await apiClient.archiveProjectTestCase(DEFAULT_PROJECT, archiveId);
      load();
    } finally {
      setArchiving(false);
      setArchiveId(null);
    }
  }

  const filtered = cases.filter((c) =>
    c.status !== "archived" &&
    (q === "" || c.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Test Cases"
        subtitle={`${filtered.length} test case${filtered.length !== 1 ? "s" : ""}`}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search test cases…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Link href="/app/test-cases/new" className={cn(buttonVariants({ variant: "default" }), "gap-2")}>
            <Plus className="size-4" />
            New Test Case
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl border border-border/60 bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground text-sm mb-4">
              {q ? `No test cases matching "${q}"` : "No test cases yet."}
            </p>
            <Link href="/app/test-cases/new" className={cn(buttonVariants({ variant: "default" }), "gap-2")}>
              <Plus className="size-4" />
              Create your first test case
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tc) => (
              <Card
                key={tc.id}
                className="group border-border/60 bg-card/50 hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => router.push(`/app/test-cases/${tc.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold line-clamp-2 leading-snug">
                      {tc.name}
                    </CardTitle>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border",
                        PRIORITY_COLORS[tc.priority] ?? PRIORITY_COLORS.P3
                      )}
                    >
                      {tc.priority}
                    </span>
                  </div>
                  <CardDescription className="flex flex-wrap gap-1.5 mt-1">
                    {tc.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/60">
                        {tag}
                      </span>
                    ))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {tc.last_run_status ? (
                        <Badge
                          variant={tc.last_run_status === "passed" ? "secondary" : "destructive"}
                          className="text-[10px] uppercase"
                        >
                          {tc.last_run_status}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Never run</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">v{tc.version}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => { e.stopPropagation(); setRunTcId(tc.id); }}
                        title="Run"
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={(e) => { e.stopPropagation(); handleClone(tc.id); }}
                        title="Clone"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-rose-500 hover:text-rose-400"
                        onClick={(e) => { e.stopPropagation(); setArchiveId(tc.id); }}
                        title="Archive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {runTcId && (
        <NewRunModal
          open
          onClose={() => setRunTcId(null)}
          initialTestCaseId={runTcId}
        />
      )}

      <Dialog open={!!archiveId} onOpenChange={(o) => { if (!o) setArchiveId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive test case?</DialogTitle>
            <DialogDescription>
              This test case will be archived and hidden from the list. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveId(null)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmArchive} disabled={archiving}>
              {archiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
