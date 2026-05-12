"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { apiClient, type Baseline } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const DEFAULT_PROJECT = "default";

function StatusBadge({ status }: { status: Baseline["status"] }) {
  const map = {
    pending_review: "border-amber-500/30 bg-amber-500/15 text-amber-400",
    approved: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
    rejected: "border-rose-500/30 bg-rose-500/15 text-rose-400",
  };
  const labels = { pending_review: "Needs Review", approved: "Approved", rejected: "Rejected" };
  return (
    <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", map[status])}>
      {labels[status]}
    </span>
  );
}

function DiffBar({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const color = pct > 10 ? "bg-rose-400" : pct > 2 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-mono w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function VisualBaselinesPage() {
  const [tab, setTab] = useState<"pending_review" | "approved" | "rejected">("pending_review");
  const [q, setQ] = useState("");
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.listBaselines(DEFAULT_PROJECT, { status: tab });
      setBaselines(res.baselines);
    } catch {
      toast.error("Failed to load baselines");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function handleApprove(id: string) {
    setActing(id);
    try {
      await apiClient.approveBaseline(DEFAULT_PROJECT, id);
      toast.success("Baseline approved");
      setBaselines((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActing(null);
    }
  }

  async function handleReject(id: string) {
    setActing(id);
    try {
      await apiClient.rejectBaseline(DEFAULT_PROJECT, id, "");
      toast.success("Baseline rejected");
      setBaselines((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error("Failed to reject");
    } finally {
      setActing(null);
    }
  }

  const filtered = baselines.filter((b) => {
    if (!q.trim()) return true;
    const qLow = q.toLowerCase();
    return (b.test_case_id ?? "").toLowerCase().includes(qLow) ||
           (b.checkpoint_id ?? "").toLowerCase().includes(qLow) ||
           (b.run_id ?? "").toLowerCase().includes(qLow);
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Visual baselines" subtitle="Screenshot diffs, review, and approval." />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Filter bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/30 p-3 md:flex-row md:items-center md:gap-4 md:py-2.5">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="h-9">
                <TabsTrigger className="px-3" value="pending_review">Needs review</TabsTrigger>
                <TabsTrigger className="px-3" value="approved">Approved</TabsTrigger>
                <TabsTrigger className="px-3" value="rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-9" placeholder="Search by test case or run ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 rounded-xl border border-border/60 bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  {tab === "pending_review"
                    ? "No baselines awaiting review. Run a test with visual assertions to generate diffs."
                    : "No baselines in this category."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((b) => (
                <Card key={b.id} className="overflow-hidden border-border/60 bg-card/60">
                  {/* Screenshot preview */}
                  <div className="relative aspect-[16/9] bg-muted flex items-center justify-center">
                    {b.screenshot_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.screenshot_url} alt="screenshot" className="object-cover w-full h-full" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No screenshot</span>
                    )}
                    <div className="absolute right-2 top-2">
                      <StatusBadge status={b.status} />
                    </div>
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div className="space-y-1 min-w-0">
                      <p className="truncate text-sm font-medium">
                        {b.test_case_id ?? "Unknown test"}
                        {b.checkpoint_id && <span className="text-muted-foreground"> · {b.checkpoint_id}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        Run: {b.run_id?.slice(0, 8) ?? "—"}
                      </p>
                    </div>

                    <DiffBar pct={b.diff_pct} />

                    <p className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()}
                    </p>

                    {b.review_note && (
                      <p className="text-xs text-muted-foreground italic truncate">Note: {b.review_note}</p>
                    )}

                    {b.status === "pending_review" && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={acting === b.id}
                          className="border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          onClick={() => handleReject(b.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={acting === b.id}
                          className="bg-emerald-500 text-white hover:bg-emerald-600"
                          onClick={() => handleApprove(b.id)}
                        >
                          Approve
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
