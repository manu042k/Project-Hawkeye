"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { apiClient } from "@/lib/api/client";
import { useTestCases } from "@/lib/api/hooks";

const MODEL_OPTIONS = [
  { value: "openrouter:openai/gpt-4o", label: "GPT-4o" },
  { value: "openrouter:anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "openrouter:openai/gpt-oss-120b:free", label: "GPT-OSS 120B (Free)" },
  { value: "groq:llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)" },
] as const;

const BROWSER_OPTIONS = [
  { value: "chromium", label: "Chromium" },
  { value: "firefox", label: "Firefox" },
  { value: "webkit", label: "WebKit" },
] as const;

interface NewRunModalProps {
  open: boolean;
  onClose: () => void;
  initialTestCaseId?: string;
}

export function NewRunModal({ open, onClose, initialTestCaseId }: NewRunModalProps) {
  const router = useRouter();
  const { data: testCases, loading: tcLoading } = useTestCases();

  const [testCaseId, setTestCaseId] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [browser, setBrowser] = useState("chromium");
  const [record, setRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        browser,
        record,
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
          <DialogDescription>
            Choose a test case, model, and browser, then launch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tc-select">Test case</Label>
            <Select
              value={testCaseId}
              onValueChange={(v) => v !== null && setTestCaseId(v)}
              disabled={tcLoading}
            >
              <SelectTrigger id="tc-select" className="w-full">
                <SelectValue placeholder={tcLoading ? "Loading…" : "Select a test case"} />
              </SelectTrigger>
              <SelectContent>
                {(testCases ?? []).map((tc) => (
                  <SelectItem key={tc.id} value={tc.id}>
                    {tc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model-select">Model</Label>
            <Select value={model} onValueChange={(v) => v !== null && setModel(v as typeof model)}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="browser-select">Browser</Label>
            <Select value={browser} onValueChange={(v) => v !== null && setBrowser(v)}>
              <SelectTrigger id="browser-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROWSER_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="record-check"
              checked={record}
              onChange={(e) => setRecord(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <Label htmlFor="record-check">Record video</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!testCaseId || submitting || tcLoading}
          >
            {submitting ? "Starting…" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
