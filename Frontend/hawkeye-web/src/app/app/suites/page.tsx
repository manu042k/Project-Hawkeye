"use client";

import { useMemo, useState } from "react";
import { Folder, Play, Search } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { suites } from "@/lib/mock-data/suites";

function percent(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function SuitesPage() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return suites;
    return suites.filter((s) => (s.name + " " + s.description).toLowerCase().includes(query));
  }, [q]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        title="Test Suites"
        showSearch
        searchPlaceholder="Search suites..."
        searchValue={q}
        onSearchChange={setQ}
        rightSlot={
          <Button onClick={() => toast.message("Static UI demo", { description: "Suite creation is not persisted." })}>
            Create Suite
          </Button>
        }
      />

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="md:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" placeholder="Search suites..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Card key={s.id} className="border-border/60 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                        <Folder className="size-5" aria-hidden="true" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <CardDescription className="font-mono">{s.testCount} Tests</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">{s.description}</p>

                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${Math.round(s.passRate * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-emerald-400">{percent(s.passRate)} Pass</span>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => toast.success("Run queued", { description: `Started suite: ${s.name}` })}
                    >
                      <Play className="size-4" aria-hidden="true" />
                      Run All
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No suites match your search.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}

