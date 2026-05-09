"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Play, Trash2 } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiClient, type TestCaseSpec } from "@/lib/api/client";

const DEFAULT_PROJECT = "default";

export default function TestCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tc, setTc] = useState<TestCaseSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient.getProjectTestCase(DEFAULT_PROJECT, id)
      .then(setTc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleArchive() {
    if (!confirm("Archive this test case?")) return;
    await apiClient.archiveProjectTestCase(DEFAULT_PROJECT, id);
    router.push("/app/test-cases");
  }

  async function handleClone() {
    const cloned = await apiClient.cloneProjectTestCase(DEFAULT_PROJECT, id);
    router.push(`/app/test-cases/${cloned.id}`);
  }

  if (loading) return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Test case" subtitle="Loading…" />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    </div>
  );

  if (error || !tc) return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Test case" subtitle="Not found" />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-rose-400">{error ?? "Test case not found"}</p>
      </main>
    </div>
  );

  const spec = tc.spec;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title={tc.name} subtitle={`v${tc.version} · ${tc.status}`} />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.push("/app/test-cases")}>
            <ArrowLeft className="size-4" /> All test cases
          </Button>
          <div className="flex gap-2">
            <Link href={`/app/runs/new?tc=${id}`} className={cn(buttonVariants({ variant: "default" }), "h-8 gap-2 text-sm")}>
              <Play className="size-3.5" /> Run
            </Link>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleClone}>
              <Copy className="size-3.5" /> Clone
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-rose-500 hover:text-rose-400" onClick={handleArchive}>
              <Trash2 className="size-3.5" /> Archive
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Priority"><Badge variant="outline">{spec.priority}</Badge></Row>
              <Row label="Browser">{spec.target.browser}</Row>
              <Row label="URL"><span className="font-mono text-xs break-all">{spec.target.url}</span></Row>
              <Row label="Tags">
                <div className="flex flex-wrap gap-1">
                  {spec.tags.length ? spec.tags.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 border border-border/60">{t}</span>
                  )) : <span className="text-muted-foreground">—</span>}
                </div>
              </Row>
              <Row label="Max steps">{spec.constraints.max_steps}</Row>
              <Row label="Timeout">{spec.constraints.timeout_seconds}s</Row>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm">Goal</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{spec.goal}</p>
              {spec.context.app_description && (
                <p className="mt-3 text-xs text-muted-foreground border-t border-border/60 pt-3">{spec.context.app_description}</p>
              )}
            </CardContent>
          </Card>

          {spec.steps && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm">Checkpoints</CardTitle>
                <CardDescription>{spec.steps.mode} mode · {spec.steps.checkpoints.length} steps</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {spec.steps.checkpoints.map((cp) => (
                  <div key={cp.id} className="flex gap-3 text-sm">
                    <span className="shrink-0 font-mono text-xs font-bold bg-muted/60 rounded px-1.5 py-0.5 mt-0.5">{cp.id}</span>
                    <div>
                      <div className="font-medium">{cp.description}</div>
                      <div className="text-xs text-muted-foreground">{cp.success_signal}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm">Assertions</CardTitle>
              <CardDescription>{spec.assertions.length} assertion{spec.assertions.length !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {spec.assertions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assertions defined.</p>
              ) : spec.assertions.map((a) => (
                <div key={a.id} className="flex gap-3 items-start text-sm">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">{a.id}</Badge>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase mr-2">{a.type}</span>
                    <span>{a.description}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
