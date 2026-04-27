"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function IntegrationsPage() {
  const [model, setModel] = useState("GPT-4 Turbo (128k context)");
  const [openAiKey, setOpenAiKey] = useState("sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx");
  const [anthropicKey, setAnthropicKey] = useState("sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx");
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [endpoint, setEndpoint] = useState("wss://mcp.internal.techops.io/v1/stream");
  const [slackEnabled, setSlackEnabled] = useState(true);
  const [jiraEnabled, setJiraEnabled] = useState(false);

  const connected = useMemo(() => endpoint.startsWith("wss://"), [endpoint]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppTopbar title="Settings" subtitle="Manage your workspace configurations, API keys, and external integrations." />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[800px] space-y-6">
          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle>AI Engine Configuration</CardTitle>
              <CardDescription>Choose a default model and manage API keys.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Model</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="h-11 font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GPT-4 Turbo (128k context)">GPT-4 Turbo (128k context)</SelectItem>
                    <SelectItem value="Claude 3 Opus">Claude 3 Opus</SelectItem>
                    <SelectItem value="Llama 3 (70B Instruct)">Llama 3 (70B Instruct)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      className="h-11 pr-10 font-mono text-sm"
                      type={showOpenAiKey ? "text" : "password"}
                      value={openAiKey}
                      onChange={(e) => setOpenAiKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowOpenAiKey((v) => !v)}
                      aria-label={showOpenAiKey ? "Hide key" : "Show key"}
                    >
                      {showOpenAiKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Anthropic API Key</Label>
                  <div className="relative">
                    <Input
                      className="h-11 pr-10 font-mono text-sm"
                      type={showAnthropicKey ? "text" : "password"}
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAnthropicKey((v) => !v)}
                      aria-label={showAnthropicKey ? "Hide key" : "Show key"}
                    >
                      {showAnthropicKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>MCP Connection</CardTitle>
                <CardDescription>Configure the Model Context Protocol stream endpoint.</CardDescription>
              </div>
              <Badge className={connected ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : ""} variant="outline">
                {connected ? "CONNECTED" : "DISCONNECTED"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input className="h-11 font-mono text-sm" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
              <p className="text-sm text-muted-foreground">
                The WebSocket endpoint for Model Context Protocol communication.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Enable or disable external integrations.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/30 p-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Slack</div>
                  <div className="text-sm text-muted-foreground">Alerts & Notifications</div>
                </div>
                <Switch checked={slackEnabled} onCheckedChange={setSlackEnabled} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/30 p-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Jira</div>
                  <div className="text-sm text-muted-foreground">Issue Tracking Sync</div>
                </div>
                <Switch checked={jiraEnabled} onCheckedChange={setJiraEnabled} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end border-t border-border/60 pt-6">
            <Button
              onClick={() =>
                toast.success("Saved", {
                  description: "Configuration saved locally (static demo).",
                })
              }
            >
              <Save className="size-4" aria-hidden="true" />
              Save Configuration
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

