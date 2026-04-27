"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { baselineDevices, baselineProjects, visualBaselines, type VisualBaseline } from "@/lib/mock-data/baselines";
import { cn } from "@/lib/utils";

function DeviceIcon({ cls }: { cls: VisualBaseline["deviceClass"] }) {
  switch (cls) {
    case "desktop":
      return <span className="text-[13px]" aria-hidden="true">🖥</span>;
    case "mobile":
      return <span className="text-[13px]" aria-hidden="true">📱</span>;
    case "tablet":
      return <span className="text-[13px]" aria-hidden="true">💠</span>;
  }
}

export default function VisualBaselinesPage() {
  const [tab, setTab] = useState<"needs-review" | "approved">("needs-review");
  const [q, setQ] = useState("");
  const [project, setProject] = useState<(typeof baselineProjects)[number]>("All Projects");
  const [device, setDevice] = useState<(typeof baselineDevices)[number]>("All Devices");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return visualBaselines.filter((b) => {
      if (b.status !== tab) return false;
      if (project !== "All Projects" && b.project !== project) return false;
      if (device === "Desktop 1080p" && b.deviceClass !== "desktop") return false;
      if (device === "Mobile iOS" && b.deviceClass !== "mobile") return false;
      if (device === "Tablet" && b.deviceClass !== "tablet") return false;
      if (query && !(b.title + " " + b.assertion).toLowerCase().includes(query)) return false;
      return true;
    });
  }, [tab, q, project, device]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Visual Baselines"
        rightSlot={
          <div className="hidden sm:block">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="needs-review">Needs Review</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="sm:hidden">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="needs-review">
                  Needs Review
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="approved">
                  Approved
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
            <div className="relative md:col-span-6">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" placeholder="Search baselines..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="md:col-span-3">
              <Select value={project} onValueChange={(v) => v && setProject(v as typeof project)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baselineProjects.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3">
              <Select value={device} onValueChange={(v) => v && setDevice(v as typeof device)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baselineDevices.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b) => (
              <Card key={b.id} className="overflow-hidden border-border/60 bg-card/60">
                <div className="relative aspect-[16/9] bg-muted">
                  <Image alt={b.title} src={b.imageUrl} fill className="object-cover" />
                  <div
                    className={cn(
                      "absolute right-2 top-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur",
                      b.status === "needs-review"
                        ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                    )}
                  >
                    {b.status === "needs-review" ? "Needs Review" : "Approved"}
                  </div>
                </div>

                <CardContent className="space-y-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.title}</div>
                    <div className="truncate text-sm text-muted-foreground">{b.assertion}</div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <DeviceIcon cls={b.deviceClass} />
                    {b.deviceLabel}
                  </div>

                  {b.status === "needs-review" ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => toast.message("Rejected", { description: "Marked as bug (local state only)." })}
                      >
                        Reject Bug
                      </Button>
                      <Button
                        className="bg-emerald-500 text-white hover:bg-emerald-600"
                        onClick={() => toast.success("Approved", { description: "Moved to Approved tab (local state only)." })}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <Button variant="outline" className="w-full" onClick={() => toast.message("Info", { description: "Approved baseline (static demo)." })}>
                        View details
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No baselines match your filters.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}

