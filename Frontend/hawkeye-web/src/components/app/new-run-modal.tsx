"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { apiClient, type TestCaseSummary } from "@/lib/api/client";
import { MODEL_GROUPS, DEFAULT_MODEL, ALL_MODELS } from "@/lib/models";

interface NewRunModalProps {
  open: boolean;
  onClose: () => void;
  initialTestCaseId?: string;
}

const DEFAULT_PROJECT = "default";

export function NewRunModal({ open, onClose, initialTestCaseId }: NewRunModalProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [testCases, setTestCases] = useState<TestCaseSummary[]>([]);
  const [tcLoading, setTcLoading] = useState(true);

  const [testCaseId, setTestCaseId] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialTestCaseId) { setTcLoading(false); return; }
    apiClient
      .listProjectTestCases(DEFAULT_PROJECT, { status: "active" })
      .then((res) => setTestCases(res.test_cases))
      .catch(() => {})
      .finally(() => setTcLoading(false));
  }, [initialTestCaseId]);

  useEffect(() => {
    if (initialTestCaseId) setTestCaseId(initialTestCaseId);
  }, [initialTestCaseId]);

  async function handleSubmit() {
    if (!testCaseId) return;
    setSubmitting(true);
    try {
      const run = await apiClient.createRun({
        test_case_id: testCaseId,
        model,
        triggered_by: session?.user?.email ?? null,
      });
      onClose();
      router.push(`/app/runs/live?id=${run.run_id}`);
    } catch {
      toast.error("Failed to start run");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure &amp; run test</DialogTitle>
          <DialogDescription>Choose a test case and model, then launch.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!initialTestCaseId && (
            <div className="space-y-1.5">
              <Label htmlFor="tc-select">Test case</Label>
              <Select
                value={testCaseId}
                onValueChange={(v) => v !== null && setTestCaseId(v)}
                disabled={tcLoading}
              >
                <SelectTrigger id="tc-select" className="w-full">
                  <SelectValue placeholder={tcLoading ? "Loading…" : "Select a test case"}>
                    {testCaseId
                      ? (testCases.find((tc) => tc.id === testCaseId)?.name ?? testCaseId)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)]">
                  {(testCases ?? []).map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>{tc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="model-select">Model</Label>
            <Select value={model} onValueChange={(v) => v && setModel(v)}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue>
                  {ALL_MODELS.find((m) => m.value === model)?.label ?? model}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)]">
                {MODEL_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.models.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!testCaseId || submitting}>
            {submitting ? "Starting…" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
