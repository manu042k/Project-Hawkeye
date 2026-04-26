import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bug,
  CheckCircle2,
  Eye,
  Gauge,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <Eye className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base">Hawkeye</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#how-it-works">
              How it Works
            </a>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/app/dashboard">
              Product
            </Link>
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#pricing">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
            >
              Sign In
            </Link>
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
        <section className="relative overflow-hidden px-6 pt-24 pb-16 sm:pt-28 sm:pb-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_top,_rgba(173,198,255,0.18),_transparent_55%)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-60" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-sm text-muted-foreground shadow-sm">
              <Badge className="h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider" variant="secondary">
                New
              </Badge>
              <span>Hawkeye v2.0 is now live</span>
              <ArrowRight className="size-4 opacity-70" aria-hidden="true" />
            </div>

            <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl">
              Observe everything.
              <br />
              <span className="bg-gradient-to-r from-primary to-[#4d8eff] bg-clip-text text-transparent">
                Resolve anything.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
              The ultimate observability platform for modern microservices. Pinpoint bottlenecks in milliseconds, not hours.
            </p>

            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link
                href="/app/dashboard"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "h-11 px-7 shadow-[0_0_20px_rgba(173,198,255,0.25)]"
                )}
              >
                Start Building Free
              </Link>
              <Link
                href="/app/settings/integrations"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-7")}
              >
                <Terminal className="size-4" aria-hidden="true" />
                Read Documentation
              </Link>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl">
            <div className="pointer-events-none absolute -inset-1 rounded-xl bg-gradient-to-b from-primary/20 to-transparent blur-xl opacity-60" />
            <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl">
              <Image
                alt="Hawkeye dashboard preview"
                className="h-auto w-full opacity-90"
                height={1200}
                priority
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDCOt48ppIfgBtKz-0X0Acbwt6DFilKiOoT_wDvpJrA_y9javUp2XhM-QLhRdY6SKnlPRcoG28DJLE4zPf1FHFNaXLNftpUQGJZq__kIbv7sXV6LRrINlaaHbRSOiplNZqI_Ca8UNBsbMRwICXAvrA5glNDsckfcrCvPlrwlDLTDWkBvoraI9ZJv6l7f3Bc8adBQjSrZNoqwOmKyehQvIzy0_IX0JP_nfXKtyeOme5o0PzrBNMYy1_Pwd43z6KyHNOGrrzTBdGMogw"
                width={2400}
              />
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-border/40 bg-card/20 px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Engineered for Complexity</h2>
              <p className="mt-3 text-muted-foreground">
                Hawkeye cuts through the noise of distributed systems to deliver actionable insights instantly.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Activity className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Distributed Tracing</CardTitle>
                  <CardDescription>
                    Follow requests across every microservice. Identify latency bottlenecks with end-to-end waterfalls.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Gauge className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Real-time Metrics</CardTitle>
                  <CardDescription>
                    Monitor CPU, memory, and custom app metrics with sub-second resolution. Dashboards update instantly.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border">
                <CardHeader className="pb-3">
                  <div className="mb-3 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
                    <Bug className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>Automated Anomaly Detection</CardTitle>
                  <CardDescription>
                    Baselines and alerts that catch abnormal behavior early—before users report issues.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Integrates in Minutes</h2>
              <p className="mt-3 text-muted-foreground">Zero-configuration agents for all major languages and frameworks.</p>
            </div>

            <div className="space-y-16 sm:space-y-20">
              <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
                <Card className="overflow-hidden border-border/60 bg-card/70">
                  <CardHeader className="space-y-0 pb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-2.5 rounded-full bg-red-500" />
                      <span className="size-2.5 rounded-full bg-yellow-500" />
                      <span className="size-2.5 rounded-full bg-green-500" />
                      <span className="ml-2 font-mono">terminal</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-foreground/90">
                      <code className="font-mono">
                        <span className="text-primary">npm</span> install @hawkeye/agent{"\n\n"}
                        <span className="text-muted-foreground">// In your app.js</span>
                        {"\n"}
                        <span className="text-primary">const</span> hawkeye ={" "}
                        <span className="text-primary">require</span>(
                        <span className="text-[#ffb786]">&apos;@hawkeye/agent&apos;</span>
                        );
                        {"\n\n"}
                        hawkeye.<span className="text-primary">init</span>({"{"}
                        {"\n"}  apiKey: process.env.<span className="text-[#ffb786]">HAWKEYE_KEY</span>,
                        {"\n"}  serviceName: <span className="text-[#ffb786]">&apos;user-auth-service&apos;</span>
                        {"\n"}
                        {"}"});{"\n"}
                      </code>
                    </pre>
                  </CardContent>
                </Card>

                <div className="space-y-5">
                  <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-border/60">
                    <span className="text-sm font-semibold">1</span>
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Install the Agent</h3>
                  <p className="text-muted-foreground sm:text-lg">
                    Drop in a lightweight agent that instruments HTTP routes, database queries, and background jobs—without manual
                    code changes.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground sm:text-base">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />
                      Node.js, Python, Go, Java, Ruby support
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />
                      Less than 2% performance overhead
                    </li>
                  </ul>
                </div>
              </div>

              <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
                <div className="order-2 md:order-1 space-y-5">
                  <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-border/60">
                    <span className="text-sm font-semibold">2</span>
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Map Your Architecture</h3>
                  <p className="text-muted-foreground sm:text-lg">
                    Hawkeye discovers dependencies automatically and builds a dynamic service map so you can see exactly how data
                    flows through your system.
                  </p>
                </div>

                <Card className="order-1 md:order-2 overflow-hidden border-border/60 bg-card/70">
                  <CardContent className="p-0">
                    <Image
                      alt="Architecture map preview"
                      className="h-[300px] w-full object-cover"
                      height={600}
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAbDL31u5YueZSKJZDBlqoXt5iVIul2efNbF_BVe2ntasG4lF98efmyEyl4MXRCkR72mvsWcf-9S1by6Wuct2ziP8frnnzM7ykaLMp0BUbkCVuspjP5jDYH2DbiD_37NBPnQn0FHQggfb9Sa1l7-KiySPsg8FeAqxoBfkS04enqW867ocYYHX4K84RAUdtbJU3qJpHz6g_aWbOnjLzFTwN8CAWYA8CDBD3dKL-LurVFF6wd3Uaaf6cOY_S79ekmlDq8C_LX-w7_wEQ"
                      width={1200}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto max-w-5xl">
            <Card className="relative overflow-hidden border-border/60 bg-card/70 p-8 text-center shadow-[0_0_40px_rgba(173,198,255,0.10)] sm:p-12">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />
              <div className="relative z-10">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready for clear visibility?</h2>
                <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:text-lg">
                  Join thousands of developers who rely on Hawkeye to keep their systems running smoothly.
                </p>

                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href="/app/dashboard" className={cn(buttonVariants({ variant: "default", size: "lg" }), "h-11 px-7")}>
                    Start Free Trial
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
