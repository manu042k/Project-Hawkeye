"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MoreVertical, Plus, Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { dashboardMetrics, recentActivity } from "@/lib/mock-data/dashboard";
import { useProjectStore } from "@/lib/project/store";
import { cn } from "@/lib/utils";

function StatusPill({ status }: { status: "passed" | "failed" | "running" }) {
  const cfg = useMemo(() => {
    switch (status) {
      case "passed":
        return { label: "Passed", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" };
      case "failed":
        return { label: "Failed", className: "border-rose-500/30 bg-rose-500/15 text-rose-400" };
      case "running":
        return { label: "Running", className: "border-amber-500/30 bg-amber-500/15 text-amber-400" };
    }
  }, [status]);

  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${cfg.className}`}>
      <span className="size-1.5 rounded-full bg-current opacity-90" />
      {cfg.label}
    </span>
  );
}

export default function DashboardPage() {
  const project = useProjectStore((s) => s.currentProject);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar
        title="Project dashboard"
        subtitle={project ? `${project.name} · ${project.environment}` : "Runs, activity, and shortcuts"}
      />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <div className="flex justify-end">
            <Link href="/app/runs/new" className={cn(buttonVariants({ variant: "default" }), "inline-flex")}>
              <Plus className="size-4" aria-hidden="true" />
              New test run
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {dashboardMetrics.map((m) => {
              const tone =
                m.tone === "success"
                  ? "text-emerald-400"
                  : m.tone === "warning"
                    ? "text-amber-400"
                    : "text-foreground";

              return (
                <Card key={m.label} className="border-border/60 bg-card/60">
                  <CardHeader className="pb-2">
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                  </CardHeader>
                  <CardContent className="flex items-baseline gap-3">
                    <div className={`text-3xl font-semibold tracking-tight ${tone}`}>{m.value}</div>
                    <div className="text-xs font-medium text-emerald-400">{m.delta}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <Link className={cn(buttonVariants({ variant: "link" }), "px-0 text-primary")} href="/app/runs/live">
                View All
              </Link>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input placeholder="Filter by test name..." className="pl-9" />
                </div>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  Demo data
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Target URL</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentActivity.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <StatusPill status={row.status} />
                        </TableCell>
                        <TableCell className="font-medium">{row.testName}</TableCell>
                        <TableCell className="font-mono text-sm text-primary">
                          <span className="cursor-pointer hover:underline">{row.targetUrl}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{row.duration}</TableCell>
                        <TableCell className="text-muted-foreground">{row.dateLabel}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label="Row actions"
                              className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                            >
                              <MoreVertical className="size-4" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Link className="w-full" href="/app/runs/live">
                                  Open run
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>Re-run</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
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

