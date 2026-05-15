import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  Eye,
  BrainCircuit,
  Globe,
  Lock,
  CalendarClock,
  GitBranch,
  Activity,
  Gauge,
  ShieldCheck,
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/brand-logo";

function loginUrl(pathAfterAuth: string) {
  return `/auth/login?${new URLSearchParams({ callbackUrl: pathAfterAuth }).toString()}`;
}

const FEATURES = [
  {
    icon: Eye,
    title: "Visual agent",
    description:
      "Takes a full screenshot at every step and reasons about what it sees — no selectors, no recorded scripts, no flakiness.",
  },
  {
    icon: BrainCircuit,
    title: "Any vision LLM",
    description:
      "Run tests with GPT-4o, Claude Sonnet, Gemini, NVIDIA NIM, or a local Ollama model. Swap without changing a single test.",
  },
  {
    icon: Globe,
    title: "Multi-browser",
    description:
      "Chromium, Firefox, and WebKit. Run the same test case across all three with a single config change.",
  },
  {
    icon: CalendarClock,
    title: "Suites & scheduling",
    description:
      "Group test cases into suites, run them all at once, or schedule on a cron. Trigger automatically on every git push.",
  },
  {
    icon: Lock,
    title: "Encrypted vault",
    description:
      "AES-256-GCM encrypted secrets injected into tests at runtime. Never visible in logs or screenshots.",
  },
  {
    icon: GitBranch,
    title: "Figma visual diff",
    description:
      "Compare agent screenshots against your Figma design files pixel-by-pixel to catch regressions before they ship.",
  },
];

export default function Home() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <BrandLogo className="w-5" alt="Hawkeye" priority />
            </span>
            <span className="text-base">Hawkeye</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#why">
              Why Hawkeye
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#faq">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden md:inline-flex" />
            <Link
              href={loginUrl("/app")}
              className={cn(
                buttonVariants({ variant: "default" }),
                "shadow-[0_0_20px_rgba(173,198,255,0.15)]"
              )}
            >
              Demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-16 pb-10 sm:pt-24 sm:pb-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(1100px_circle_at_top,_rgba(173,198,255,0.22),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_30%,_rgba(255,183,134,0.14),_transparent_60%)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-70" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                <Badge className="h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider" variant="secondary">
                  AI-Powered QA
                </Badge>
                <span>Autonomous agents. Real browsers. No scripts.</span>
                <ArrowRight className="size-4 opacity-70" aria-hidden="true" />
              </div>

              <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
                AI agents that test your app
                <span className="bg-gradient-to-r from-primary to-[#4d8eff] bg-clip-text text-transparent"> the way humans do</span>.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
                Hawkeye sends vision-capable AI agents into your web app. They screenshot every step, reason about what they see, and catch regressions before your users do — no brittle recorded scripts required.
              </p>

              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href={loginUrl("/app")}
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "h-11 px-7 shadow-[0_0_20px_rgba(173,198,255,0.25)]"
                  )}
                >
                  Try the demo
                </Link>
                <Link href="#features" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-7")}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  See how it works
                </Link>
              </div>
            </div>

            {/* Live execution preview */}
            <div id="product" className="mt-14 grid gap-4 md:grid-cols-12">
              <Card className="border-border/60 bg-card/50 md:col-span-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Live execution</CardTitle>
                  <CardDescription>Follow agent decisions step-by-step — screenshot, reasoning, action, result.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 rounded-full bg-rose-500/80" />
                      <span className="size-2.5 rounded-full bg-amber-500/80" />
                      <span className="size-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2">agent trace</span>
                    </div>
                    <Separator className="my-3 bg-border/60" />
                    <div className="space-y-2">
                      <div>
                        <span className="text-foreground/90">[Observe]</span> Screenshot captured. Accessibility tree parsed.
                      </div>
                      <div>
                        <span className="text-primary">[Reason]</span> Checkout CTA visible. Proceeding to click.
                      </div>
                      <div>
                        <span className="text-amber-400">[Act]</span> browser_click(&quot;button[data-test=&apos;checkout&apos;]&quot;)
                      </div>
                      <div>
                        <span className="text-foreground/90">[Observe]</span> Order confirmation page rendered.
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="h-4 w-1.5 bg-primary/70 animate-pulse" />
                        <span className="italic">running assertion checks…</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link href={loginUrl("/app/runs/live")} className={cn(buttonVariants({ variant: "default" }), "justify-center")}>
                      <Zap className="size-4" aria-hidden="true" />
                      Watch it live
                    </Link>
                    <Link href={loginUrl("/app/runs/new")} className={cn(buttonVariants({ variant: "outline" }), "justify-center")}>
                      Configure a run
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:col-span-5">
                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Test suites</CardTitle>
                    <CardDescription>Group runs, schedule with cron, trigger on git push.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">Checkout Flow</div>
                      <div className="font-mono text-xs">14 tests · 85% pass · runs nightly</div>
                    </div>
                    <Link href={loginUrl("/app/suites")} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Open
                    </Link>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Visual baselines</CardTitle>
                    <CardDescription>Pixel-diff against Figma or approved screenshots.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">3 regressions flagged</div>
                      <div className="font-mono text-xs">awaiting review · 2 projects</div>
                    </div>
                    <Link href={loginUrl("/app/visual-baselines")} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Review
                    </Link>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Vault</CardTitle>
                    <CardDescription>AES-256 encrypted secrets. Injected at runtime.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">PROD_STRIPE_SECRET_KEY</div>
                      <div className="font-mono text-xs">••••••••••••••••••••</div>
                    </div>
                    <Link href={loginUrl("/app/vault")} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Manage
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section id="features" className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need to ship confidently</h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">
                One platform for writing, running, scheduling, and reviewing AI-driven QA tests.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="border-border/60 bg-card/70 transition-colors hover:border-border">
                  <CardHeader className="pb-3">
                    <div className="mb-3 inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why Hawkeye */}
        <section id="why" className="px-6 py-20 sm:py-24 bg-card/20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Why autonomous, not scripted</h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">
                Traditional test frameworks break when your UI changes. Hawkeye agents adapt — because they see, not select.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Eye className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Vision over selectors</CardTitle>
                  <CardDescription>
                    Agents screenshot and reason about the page on every step. A button moving 10px doesn&apos;t break your test.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Gauge className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Fast feedback loops</CardTitle>
                  <CardDescription>
                    Tests run in parallel across browsers. Results stream live. Review and rerun in seconds, not minutes.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Activity className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Full observability</CardTitle>
                  <CardDescription>
                    Every step is traced — screenshot, reasoning, action, tokens, latency, cost. No black boxes.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                    Built for real products
                  </CardTitle>
                  <CardDescription>The full stack you need for production QA — not a toy demo.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <ul className="space-y-2">
                    {[
                      "AES-256 vault secrets injected at test runtime",
                      "GitHub webhook triggers suite runs on push",
                      "Cron scheduling with branch filters",
                    ].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
                    Model-agnostic
                  </CardTitle>
                  <CardDescription>Bring your own LLM or use ours. Switch any time.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <ul className="space-y-2">
                    {[
                      "GPT-4o, Claude Sonnet, Gemini Pro Vision",
                      "NVIDIA NIM (hosted) or Ollama (local / private)",
                      "Per-run model selection — no lock-in",
                    ].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <Card className="relative overflow-hidden border-border/60 bg-card/70 p-8 text-center shadow-[0_0_40px_rgba(173,198,255,0.10)] sm:p-12">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />
              <div className="relative z-10">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to stop guessing and start shipping?</h2>
                <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:text-lg">
                  Try the live demo — run an AI agent against a real web app, watch the trace stream, review results.
                </p>

                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href={loginUrl("/app")} className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-7")}>
                    Open demo
                  </Link>
                  <span className="text-sm text-muted-foreground sm:px-2">or</span>
                  <a className="text-sm text-foreground/90 underline underline-offset-4 hover:text-foreground" href="mailto:hello@hawkeye.dev">
                    Talk to us
                  </a>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-6 pb-24">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQ</h2>
              <p className="mt-3 text-muted-foreground">Common questions about how Hawkeye works.</p>
            </div>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="p-6">
                <Accordion>
                  <AccordionItem value="item-1">
                    <AccordionTrigger>How does the agent navigate a web app?</AccordionTrigger>
                    <AccordionContent>
                      At every step the agent takes a full screenshot via Chrome DevTools Protocol and reads the accessibility tree via Playwright MCP. Both are sent to a vision-capable LLM which decides what to do next — click, type, navigate, or assert. No selectors are hardcoded.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>Which LLMs are supported?</AccordionTrigger>
                    <AccordionContent>
                      GPT-4o, Claude Sonnet, Gemini Pro Vision, NVIDIA NIM (cloud), and Ollama (local). You pick the model per run — no migration needed to switch. Text-only models are supported too; they skip the screenshot and use the accessibility tree alone.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>Can I trigger runs from CI/CD?</AccordionTrigger>
                    <AccordionContent>
                      Yes. Hawkeye listens for GitHub push webhooks and can run a suite automatically on every push to a configured branch. You can also trigger runs via the REST API or schedule them with a cron expression in the dashboard.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger>How are secrets handled?</AccordionTrigger>
                    <AccordionContent>
                      Secrets are stored AES-256-GCM encrypted in the vault. They are injected into test cases at runtime and never written to logs or screenshots. Each secret has explicit reveal and copy controls in the UI.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-5">
                    <AccordionTrigger>What browsers does it support?</AccordionTrigger>
                    <AccordionContent>
                      Chromium, Firefox, and WebKit (Safari engine) via Playwright. You can run the same test case across all three browsers from a single configuration.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-card/20 px-6 py-10 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <BrandLogo className="w-4" alt="Hawkeye" />
            </span>
            Hawkeye
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#privacy">
              Privacy Policy
            </a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#terms">
              Terms of Service
            </a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#changelog">
              Changelog
            </a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#status">
              Status
            </a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="https://github.com" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>

          <div>© 2026 Hawkeye. Built for developers.</div>
        </div>
      </footer>
    </div>
  );
}
