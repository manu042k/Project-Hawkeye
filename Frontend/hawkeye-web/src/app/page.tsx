import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bug,
  CheckCircle2,
  Eye,
  Sparkles,
  Zap,
  Gauge,
  Shield,
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function Home() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <Eye className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base">Hawkeye</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#product">
              Product
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#why">
              Why Hawkeye
            </a>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/app/dashboard">
              Demo
            </Link>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#faq">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              Sign In
            </Link>
            <ThemeToggle className="hidden md:inline-flex" />
            <Link
              href="/app/dashboard"
              className={cn(
                buttonVariants({ variant: "default" }),
                "shadow-[0_0_20px_rgba(173,198,255,0.15)]"
              )}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-6 pt-16 pb-10 sm:pt-20 sm:pb-14">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(1100px_circle_at_top,_rgba(173,198,255,0.22),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_30%,_rgba(255,183,134,0.14),_transparent_60%)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-70" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                <Badge className="h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider" variant="secondary">
                  Modern QA
                </Badge>
                <span>Ship with confidence, not guesswork</span>
                <ArrowRight className="size-4 opacity-70" aria-hidden="true" />
              </div>

              <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
                The control plane for
                <span className="bg-gradient-to-r from-primary to-[#4d8eff] bg-clip-text text-transparent"> test ops</span>.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
                Live execution, suite management, visual baselines, and secrets—wrapped in a dark-first UI your team can use all day.
              </p>

              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/app/dashboard"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "h-11 px-7 shadow-[0_0_20px_rgba(173,198,255,0.25)]"
                  )}
                >
                  Open interactive demo
                </Link>
                <Link href="#product" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-7")}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  See what’s inside
                </Link>
              </div>
            </div>

            <div id="product" className="mt-12 grid gap-4 md:grid-cols-12">
              <Card className="border-border/60 bg-card/50 md:col-span-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Live execution</CardTitle>
                  <CardDescription>Follow agent decisions step-by-step with zero ambiguity.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-4 font-mono text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 rounded-full bg-rose-500/80" />
                      <span className="size-2.5 rounded-full bg-amber-500/80" />
                      <span className="size-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2">execution.log</span>
                    </div>
                    <Separator className="my-3 bg-border/60" />
                    <div className="space-y-2">
                      <div>
                        <span className="text-foreground/90">[Reasoning]</span> Page loaded. Identify checkout CTA.
                      </div>
                      <div>
                        <span className="text-primary">[Action]</span> click_element(&quot;button[data-test=&apos;checkout&apos;]&quot;)
                      </div>
                      <div>
                        <span className="text-foreground/90">[Reasoning]</span> Checkout opened. Verifying totals + shipping form.
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="h-4 w-1.5 bg-primary/70 animate-pulse" />
                        <span className="italic">awaiting next action…</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link href="/app/runs/live" className={cn(buttonVariants({ variant: "default" }), "justify-center")}>
                      <Zap className="size-4" aria-hidden="true" />
                      Watch it live
                    </Link>
                    <Link href="/app/runs/new" className={cn(buttonVariants({ variant: "outline" }), "justify-center")}>
                      Configure a run
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:col-span-5">
                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Suites</CardTitle>
                    <CardDescription>Organize runs into durable, searchable test suites.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">Authentication Core</div>
                      <div className="font-mono text-xs">14 tests • 85% pass</div>
                    </div>
                    <Link href="/app/suites" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Open
                    </Link>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Visual baselines</CardTitle>
                    <CardDescription>Approve diffs quickly with a review-first workflow.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">Needs review</div>
                      <div className="font-mono text-xs">12 pending • 3 projects</div>
                    </div>
                    <Link href="/app/visual-baselines" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Review
                    </Link>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Vault</CardTitle>
                    <CardDescription>Mask-by-default secret handling built into the UI.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <div className="font-semibold text-foreground">PROD_STRIPE_SECRET_KEY</div>
                      <div className="font-mono text-xs">••••••••••••••••••••</div>
                    </div>
                    <Link href="/app/vault" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Manage
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section id="why" className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">A UI built for fast teams</h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">
                Most tools fail at the last mile: the interface. Hawkeye focuses on clarity, speed, and low-fatigue workflows.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Activity className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Operational clarity</CardTitle>
                  <CardDescription>
                    See what happened, why it happened, and what to do next—without spelunking through logs.
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
                    Keep the signal high. Review baselines, rerun suites, and fix regressions quickly.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Bug className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Built-in guardrails</CardTitle>
                  <CardDescription>
                    Strong UX defaults that support secure and repeatable operations.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="size-4 text-primary" aria-hidden="true" />
                    Security-first patterns
                  </CardTitle>
                  <CardDescription>Mask-by-default secret handling and safe actions.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <ul className="space-y-2">
                    {[
                      "Explicit reveal controls and copy affordances",
                      "Clear confirmation steps for destructive actions",
                      "Token-driven contrast for accessibility",
                    ].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-primary" aria-hidden="true" />
                    Designed for dark mode
                  </CardTitle>
                  <CardDescription>Low fatigue, high contrast, clear hierarchy.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    Hawkeye’s design language uses tonal layering instead of heavy shadows, consistent radii, and type choices that
                    keep focus on what matters: your run results and actions.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto max-w-5xl">
            <Card className="relative overflow-hidden border-border/60 bg-card/70 p-8 text-center shadow-[0_0_40px_rgba(173,198,255,0.10)] sm:p-12">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />
              <div className="relative z-10">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to ship with confidence?</h2>
                <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:text-lg">
                  Explore the full static demo UI: dashboard, live runs, suites, baselines, vault, and settings.
                </p>

                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href="/app/dashboard" className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-7")}>
                    Open demo
                  </Link>
                  <span className="text-sm text-muted-foreground sm:px-2">or</span>
                  <Link className="text-sm text-foreground/90 underline underline-offset-4 hover:text-foreground" href="/auth/login">
                    Talk to Sales
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section id="faq" className="px-6 pb-24">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQ</h2>
              <p className="mt-3 text-muted-foreground">Quick answers to common questions.</p>
            </div>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="p-6">
                <Accordion>
                  <AccordionItem value="item-1">
                    <AccordionTrigger>Is this wired to a backend yet?</AccordionTrigger>
                    <AccordionContent>
                      Not in this build. The UI is static with local interactions (filters, dialogs, toasts, simulated logs).
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>Can we connect it to real auth and APIs?</AccordionTrigger>
                    <AccordionContent>
                      Yes. The next step is to replace mock data with API calls and add an auth provider (session/JWT) depending on
                      your backend.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>Does the UI follow the design system tokens?</AccordionTrigger>
                    <AccordionContent>
                      Yes—colors, radii, and typography are driven by CSS variables mapped from your design system.
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
              <Eye className="size-4" aria-hidden="true" />
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
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#github">
              GitHub
            </a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#twitter">
              Twitter
            </a>
          </div>

          <div>© 2026 Hawkeye. Built for developers.</div>
        </div>
      </footer>
    </div>
  );
}
