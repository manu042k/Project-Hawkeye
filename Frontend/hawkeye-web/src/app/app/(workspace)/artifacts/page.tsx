"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Clock, Play, Search, SlidersHorizontal, XCircle } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjectRuns } from "@/lib/api/hooks";
import { type RunStatus } from "@/lib/api/client";
import { useProjectStore } from "@/lib/project/store";

const TERMINAL = new Set<RunStatus>(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

const STATUS_CFG: Record<RunStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  queued:    { label: "Queued",    icon: <Clock className="size-3.5 text-amber-400" />,   badge: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  running:   { label: "Running",   icon: <Clock className="size-3.5 text-amber-400" />,   badge: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  passed:    { label: "Passed",    icon: <CheckCircle2 className="size-3.5 text-emerald-400" />, badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  failed:    { label: "Failed",    icon: <XCircle className="size-3.5 text-rose-400" />,  badge: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  errored:   { label: "Errored",   icon: <XCircle className="size-3.5 text-rose-400" />,  badge: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  timed_out: { label: "Timed out", icon: <Clock className="size-3.5 text-orange-400" />,  badge: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  blocked:   { label: "Blocked",   icon: <XCircle className="size-3.5 text-violet-400" />, badge: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
  cancelled: { label: "Cancelled", icon: <Clock className="size-3.5 text-slate-400" />,   badge: "border-slate-500/30 bg-slate-500/10 text-slate-400" },
};

function StatusBadge({ status }: { status: RunStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.errored;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", c.badge)}>
      {c.icon}
      {c.label}
    </span>
  );
}

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
}

const PAGE_SIZE = 15;

type StatusFilter = "all" | "passed" | "failed";

export default function ArtifactsPage() {
  const router = useRouter();
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const { data: runs, loading } = useProjectRuns(projectId);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const completed = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter((r) => TERMINAL.has(r.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [runs]);

  const filtered = useMemo(() => {
    let list = completed;
    if (filter === "passed") list = list.filter((r) => r.status === "passed");
    if (filter === "failed") list = list.filter((r) => r.status === "failed" || r.status === "errored");
    if (q.trim()) list = list.filter((r) =>
      (r.test_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
      r.run_id.toLowerCase().includes(q.toLowerCase())
    );
    return list;
  }, [completed, filter, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleQ(val: string) { setQ(val); setPage(1); }
  function handleFilter(val: StatusFilter) { setFilter(val); setPage(1); }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Artifacts"
        subtitle={`${completed.length} completed run${completed.length !== 1 ? "s" : ""}`}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search runs…" value={q} onChange={(e) => handleQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/20 p-0.5">
            {(["all", "passed", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFilter(f)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                  filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl border border-border/60 bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          q || filter !== "all" ? (
            /* ── Filtered empty state ── */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 py-20 text-center">
              <SlidersHorizontal className="size-10 text-muted-foreground/25" />
              <p className="mt-4 text-sm font-medium">No runs match your filters</p>
              <p className="mt-1 text-xs text-muted-foreground">Try clearing the search or changing the status filter.</p>
              <div className="mt-4 flex gap-2">
                {q && (
                  <Button variant="outline" size="sm" onClick={() => { setQ(""); setPage(1); }}>
                    Clear search
                  </Button>
                )}
                {filter !== "all" && (
                  <Button variant="outline" size="sm" onClick={() => { setFilter("all"); setPage(1); }}>
                    Show all statuses
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* ── No runs at all ── */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 py-24 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/30">
                <Archive className="size-8 text-muted-foreground/40" />
              </div>
              <p className="mt-5 text-base font-semibold tracking-tight">No completed runs yet</p>
              <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
                Finished runs land here with their full trace, screenshots, and assertion results.
              </p>
              <div className="mt-6 flex gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => router.push("/app/runs/new")}>
                  <Play className="size-3.5" /> Start a run
                </Button>
                <Button variant="outline" size="sm" onClick={() => router.push("/app/test-cases")}>
                  Browse test cases
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Test Case</th>
                  <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Date</th>
                  <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Run by</th>
                  <th className="hidden px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Steps</th>
                  <th className="hidden px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Duration</th>
                  <th className="hidden px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {pageRows.map((run) => (
                  <tr
                    key={run.run_id}
                    onClick={() => router.push(`/app/artifacts/${run.run_id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/30 group"
                  >
                    <td className="px-4 py-3.5">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium group-hover:text-primary transition-colors line-clamp-1">
                        {run.test_name ?? run.run_id.slice(0, 8)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{run.run_id.slice(0, 12)}</p>
                    </td>
                    <td className="hidden px-4 py-3.5 text-muted-foreground sm:table-cell whitespace-nowrap">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="hidden px-4 py-3.5 text-muted-foreground lg:table-cell truncate max-w-[140px]">
                      {run.triggered_by ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-right font-mono text-muted-foreground md:table-cell">
                      {run.total_steps != null ? run.total_steps : "—"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-right font-mono text-muted-foreground md:table-cell whitespace-nowrap">
                      {formatDuration(run.duration_s)}
                    </td>
                    <td className="hidden px-4 py-3.5 text-right font-mono text-muted-foreground lg:table-cell whitespace-nowrap">
                      {run.estimated_cost_usd != null ? `$${run.estimated_cost_usd.toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} runs
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded text-xs transition-colors",
                        safePage === p
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
