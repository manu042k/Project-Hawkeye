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

const MODEL_GROUPS = [
  {
    label: "Anthropic (via OpenRouter)",
    models: [
      { value: "openrouter:anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5 ✦ vision" },
      { value: "openrouter:anthropic/claude-opus-4", label: "Claude Opus 4 ✦ vision" },
      { value: "openrouter:anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 ✦ vision" },
    ],
  },
  {
    label: "OpenAI (via OpenRouter)",
    models: [
      { value: "openrouter:openai/gpt-4o", label: "GPT-4o ✦ vision" },
      { value: "openrouter:openai/gpt-4.1", label: "GPT-4.1 ✦ vision" },
      { value: "openrouter:openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free tier)" },
    ],
  },
  {
    label: "Groq",
    models: [
      { value: "groq:llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { value: "groq:llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    ],
  },
  {
    label: "NVIDIA NIM",
    models: [
      { value: "nvidia:nvidia/llama-3.2-90b-vision-instruct", label: "Llama 3.2 90B Vision ✦ vision" },
      { value: "nvidia:nvidia/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision ✦ vision" },
      { value: "nvidia:meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct" },
      { value: "nvidia:nvidia/nemotron-4-340b-instruct", label: "Nemotron 4 340B ✦ vision" },
    ],
  },
];

const DEFAULT_MODEL = MODEL_GROUPS[0].models[0].value;


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
          <DialogDescription>
            Choose a test case, model, and browser, then launch.
          </DialogDescription>
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
                <SelectContent>
                  {(testCases ?? []).map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>
                      {tc.name}
                    </SelectItem>
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
                  {MODEL_GROUPS.flatMap((g) => g.models).find((m) => m.value === model)?.label ?? model}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MODEL_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.models.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!testCaseId || submitting}
          >
            {submitting ? "Starting…" : "Run test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
