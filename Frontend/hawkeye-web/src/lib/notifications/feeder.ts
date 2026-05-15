"use client";

import { useEffect, useRef } from "react";
import { useNotificationStore } from "./store";
import { useProjectRuns } from "@/lib/api/hooks";
import { useProjectStore } from "@/lib/project/store";
import type { RunSummary } from "@/lib/api/client";

const TERMINAL = new Set(["passed", "failed", "errored", "timed_out", "blocked", "cancelled"]);

export function useNotificationFeeder() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const projectId = currentProject?.id ?? null;
  const { data: runs } = useProjectRuns(projectId);
  const { add, getAlertPrefs } = useNotificationStore();

  // Track which run IDs we've already notified about (survives re-renders)
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!runs || !projectId) return;
    const prefs = getAlertPrefs(projectId);

    runs.forEach((run: RunSummary) => {
      if (!TERMINAL.has(run.status)) return;
      if (notifiedRef.current.has(run.run_id)) return;

      notifiedRef.current.add(run.run_id);

      const name = run.test_name ?? run.run_id.slice(0, 8);
      const href = `/app/artifacts/${run.run_id}`;

      if ((run.status === "failed" || run.status === "errored") && prefs.onFailure) {
        add({
          level: "error",
          title: `Run failed: ${name}`,
          body: run.termination_reason ?? undefined,
          href,
          projectId,
          runId: run.run_id,
        });
      } else if (run.status === "timed_out" && prefs.onFailure) {
        add({
          level: "warning",
          title: `Run timed out: ${name}`,
          href,
          projectId,
          runId: run.run_id,
        });
      } else if (run.status === "blocked" && prefs.onFailure) {
        add({
          level: "warning",
          title: `Run blocked: ${name}`,
          body: run.termination_reason ?? undefined,
          href,
          projectId,
          runId: run.run_id,
        });
      } else if (run.status === "passed" && prefs.onSuccess) {
        add({
          level: "success",
          title: `Run passed: ${name}`,
          href,
          projectId,
          runId: run.run_id,
        });
      }
    });
  }, [runs, projectId, add, getAlertPrefs]);
}
