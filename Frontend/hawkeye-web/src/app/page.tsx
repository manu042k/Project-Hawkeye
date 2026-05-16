import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Eye,
  BrainCircuit,
  Globe,
  Lock,
  CalendarClock,
  GitBranch,
  Activity,
  Gauge,
  ShieldCheck,
  Play,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/brand-logo";
import { TerminalTrace } from "@/components/landing/terminal-trace";

const CONTACT_EMAIL = "hello@hawkeye.dev";
const YOUTUBE_VIDEO_ID = "Tzs1F4A5kKs";

const FEATURES = [
  {
    icon: Eye,
    title: "Visual agent",
    description:
      "Takes a full screenshot at every step and reasons about what it sees — no selectors, no recorded scripts, no flakiness.",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    iconRing: "ring-blue-500/20",
  },
  {
    icon: BrainCircuit,
    title: "Any vision LLM",
    description:
      "Run tests with GPT-4o, Claude Sonnet, Gemini, NVIDIA NIM, or a local Ollama model. Swap without changing a single test.",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
    iconRing: "ring-violet-500/20",
  },
  {
    icon: Globe,
    title: "Multi-browser",
    description:
      "Chromium, Firefox, and WebKit. Run the same test case across all three with a single config change.",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    iconRing: "ring-emerald-500/20",
  },
  {
    icon: CalendarClock,
    title: "Suites & scheduling",
    description:
      "Group test cases into suites, run them all at once, or schedule on a cron. Trigger automatically on every git push.",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    iconRing: "ring-amber-500/20",
  },
  {
    icon: Lock,
    title: "Encrypted vault",
    description:
      "AES-256-GCM encrypted secrets injected into tests at runtime. Never visible in logs or screenshots.",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    iconRing: "ring-rose-500/20",
  },
  {
    icon: GitBranch,
    title: "Figma visual diff",
    description:
      "Compare agent screenshots against your Figma design files pixel-by-pixel to catch regressions before they ship.",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-400",
    iconRing: "ring-cyan-500/20",
  },
];

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
            <BrandLogo className="w-5" alt="Hawkeye" priority />
          </span>
          <span className="text-base">Hawkeye</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm md:flex">
          <a className="text-muted-foreground transition-colors hover:text-foreground" href="#demo">Demo</a>
          <a className="text-muted-foreground transition-colors hover:text-foreground" href="#features">Features</a>
          <a className="text-muted-foreground transition-colors hover:text-foreground" href="#why">Why Hawkeye</a>
          <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/blog">Blog</Link>
          <a className="text-muted-foreground transition-colors hover:text-foreground" href="#faq">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle className="hidden md:inline-flex" />
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={cn(buttonVariants({ variant: "default" }), "shadow-[0_0_20px_rgba(173,198,255,0.15)]")}
          >
            Get in touch
          </a>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
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
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-7 shadow-[0_0_20px_rgba(173,198,255,0.25)]")}
            >
              Request a demo
            </a>
            <a href="#demo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-7")}>
              <Sparkles className="size-4" aria-hidden="true" />
              Watch it in action
            </a>
          </div>
        </div>

        <div id="product" className="mt-14 grid gap-4 md:grid-cols-12">
          <Card className="border-border/60 bg-card/50 md:col-span-7">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live execution</CardTitle>
              <CardDescription>Follow agent decisions step-by-step — screenshot, reasoning, action, result.</CardDescription>
            </CardHeader>
            <CardContent>
              <TerminalTrace />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:col-span-5">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Test suites</CardTitle>
                <CardDescription>Group runs, schedule with cron, trigger on git push.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">Checkout Flow</div>
                  <div className="font-mono text-xs">14 tests · 85% pass · runs nightly</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visual baselines</CardTitle>
                <CardDescription>Pixel-diff against Figma or approved screenshots.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">3 regressions flagged</div>
                  <div className="font-mono text-xs">awaiting review · 2 projects</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Vault</CardTitle>
                <CardDescription>AES-256 encrypted secrets. Injected at runtime.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">PROD_STRIPE_SECRET_KEY</div>
                  <div className="font-mono text-xs">••••••••••••••••••••</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See Hawkeye in action</h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            Watch an AI agent navigate a real web app — screenshot by screenshot, decision by decision.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-[0_0_40px_rgba(173,198,255,0.08)]">
          {YOUTUBE_VIDEO_ID ? (
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0&modestbranding=1`}
                title="Hawkeye demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="aspect-video w-full flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-card/80 via-background/60 to-card/80">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_50%_50%,_rgba(173,198,255,0.12),_transparent_70%)]" />
              <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
                <div className="inline-flex size-20 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_30px_rgba(173,198,255,0.2)]">
                  <Play className="size-8 text-primary fill-primary" aria-hidden="true" />
                </div>
                <p className="text-lg font-medium text-foreground/80">Demo video coming soon</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Want an early walkthrough?{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-4 hover:text-primary/80">
                    Reach out
                  </a>{" "}
                  and we&apos;ll walk you through it live.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need to ship confidently</h2>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            One platform for writing, running, scheduling, and reviewing AI-driven QA tests.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description, iconBg, iconColor, iconRing }) => (
            <Card key={title} className="border-border/60 bg-card/70 transition-colors hover:border-border">
              <CardHeader className="pb-3">
                <div className={cn("mb-3 inline-flex size-11 items-center justify-center rounded-lg ring-1", iconBg, iconColor, iconRing)}>
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
  );
}

function WhySection() {
  const productionFeatures = [
    "AES-256 vault secrets injected at test runtime",
    "GitHub webhook triggers suite runs on push",
    "Cron scheduling with branch filters",
  ];
  const modelFeatures = [
    "GPT-4o, Claude Sonnet, Gemini Pro Vision",
    "NVIDIA NIM (hosted) or Ollama (local / private)",
    "Per-run model selection — no lock-in",
  ];

  return (
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
              <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                <Eye className="size-5" aria-hidden="true" />
              </div>
              <CardTitle>Vision over selectors</CardTitle>
              <CardDescription>Agents screenshot and reason about the page on every step. A button moving 10px doesn&apos;t break your test.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
            <CardHeader className="pb-3">
              <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                <Gauge className="size-5" aria-hidden="true" />
              </div>
              <CardTitle>Fast feedback loops</CardTitle>
              <CardDescription>Tests run in parallel across browsers. Results stream live. Review and rerun in seconds, not minutes.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
            <CardHeader className="pb-3">
              <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <Activity className="size-5" aria-hidden="true" />
              </div>
              <CardTitle>Full observability</CardTitle>
              <CardDescription>Every step is traced — screenshot, reasoning, action, tokens, latency, cost. No black boxes.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-rose-400" aria-hidden="true" />
                Built for real products
              </CardTitle>
              <CardDescription>The full stack you need for production QA — not a toy demo.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-2">
                {productionFeatures.map((t) => (
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
                <BrainCircuit className="size-4 text-violet-400" aria-hidden="true" />
                Model-agnostic
              </CardTitle>
              <CardDescription>Bring your own LLM or use ours. Switch any time.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-2">
                {modelFeatures.map((t) => (
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
  );
}

function CtaSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <Card className="relative overflow-hidden border-border/60 bg-card/70 p-8 text-center shadow-[0_0_40px_rgba(173,198,255,0.10)] sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />
          <div className="relative z-10">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to stop guessing and start shipping?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:text-lg">
              Reach out and we&apos;ll walk you through a live demo of Hawkeye running against your app.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={`mailto:${CONTACT_EMAIL}`} className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-7")}>
                Request a demo
              </a>
              <span className="text-sm text-muted-foreground sm:px-2">or</span>
              <a href="#demo" className="text-sm text-foreground/90 underline underline-offset-4 hover:text-foreground">
                Watch the video
              </a>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    {
      value: "item-1",
      q: "How does the agent navigate a web app?",
      a: "At every step the agent takes a full screenshot via Chrome DevTools Protocol and reads the accessibility tree via Playwright MCP. Both are sent to a vision-capable LLM which decides what to do next — click, type, navigate, or assert. No selectors are hardcoded.",
    },
    {
      value: "item-2",
      q: "Which LLMs are supported?",
      a: "GPT-4o, Claude Sonnet, Gemini Pro Vision, NVIDIA NIM (cloud), and Ollama (local). You pick the model per run — no migration needed to switch. Text-only models are supported too; they skip the screenshot and use the accessibility tree alone.",
    },
    {
      value: "item-3",
      q: "Can I trigger runs from CI/CD?",
      a: "Yes. Hawkeye listens for GitHub push webhooks and can run a suite automatically on every push to a configured branch. You can also trigger runs via the REST API or schedule them with a cron expression in the dashboard.",
    },
    {
      value: "item-4",
      q: "How are secrets handled?",
      a: "Secrets are stored AES-256-GCM encrypted in the vault. They are injected into test cases at runtime and never written to logs or screenshots. Each secret has explicit reveal and copy controls in the UI.",
    },
    {
      value: "item-5",
      q: "What browsers does it support?",
      a: "Chromium, Firefox, and WebKit (Safari engine) via Playwright. You can run the same test case across all three browsers from a single configuration.",
    },
  ];

  return (
    <section id="faq" className="px-6 pb-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQ</h2>
          <p className="mt-3 text-muted-foreground">Common questions about how Hawkeye works.</p>
        </div>
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-6">
            <Accordion>
              {faqs.map(({ value, q, a }) => (
                <AccordionItem key={value} value={value}>
                  <AccordionTrigger>{q}</AccordionTrigger>
                  <AccordionContent>{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function LandingFooter() {
  const links = [
    { label: "Privacy Policy", href: "#privacy" },
    { label: "Terms of Service", href: "#terms" },
    { label: "Changelog", href: "#changelog" },
    { label: "Status", href: "#status" },
    { label: "GitHub", href: "https://github.com", external: true },
  ];

  return (
    <footer className="border-t border-border/60 bg-card/20 px-6 py-10 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
            <BrandLogo className="w-4" alt="Hawkeye" />
          </span>
          Hawkeye
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {links.map(({ label, href, external }) => (
            <a
              key={label}
              className="opacity-80 transition-opacity hover:opacity-100"
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {label}
            </a>
          ))}
        </div>

        <div>© 2026 Hawkeye. Built for developers.</div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <DemoSection />
        <FeaturesSection />
        <WhySection />
        <CtaSection />
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
