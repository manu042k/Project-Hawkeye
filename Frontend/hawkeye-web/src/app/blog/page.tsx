import Link from "next/link";
import { ArrowRight, Clock, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/brand-logo";
import { POSTS, formatDate } from "@/lib/blog/posts";

const CONTACT_EMAIL = "hello@hawkeye.dev";

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  Engineering:  "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  Product:      "bg-amber-500/10 text-amber-400 ring-amber-500/20",
};

export default function BlogPage() {
  const [featured, ...rest] = POSTS;

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* Header — same as landing page */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <BrandLogo className="w-5" alt="Hawkeye" priority />
            </span>
            <span className="text-base">Hawkeye</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#demo">
              Demo
            </Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#features">
              Features
            </Link>
            <Link className="font-medium text-foreground" href="/blog">
              Blog
            </Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#faq">
              FAQ
            </Link>
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

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          {/* Page header */}
          <div className="mb-12">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Blog</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Behind-the-scenes on building Hawkeye — architecture decisions, lessons learned, and what&apos;s coming next.
            </p>
          </div>

          {/* Featured post */}
          {featured && (
            <Link href={`/blog/${featured.slug}`} className="group block mb-8">
              <Card className="border-border/60 bg-card/70 transition-colors hover:border-border overflow-hidden">
                <CardHeader className="pb-3 pt-6 px-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", CATEGORY_COLORS[featured.category] ?? "bg-muted text-muted-foreground ring-border/60")}>
                      <Tag className="size-3" aria-hidden="true" />
                      {featured.category}
                    </span>
                    <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider">
                      Latest
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold leading-snug group-hover:text-primary transition-colors">
                    {featured.title}
                  </CardTitle>
                  <CardDescription className="text-base mt-2">{featured.excerpt}</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatDate(featured.date)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {featured.readingTime}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Read more <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Rest of posts */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
                <Card className="h-full border-border/60 bg-card/70 transition-colors hover:border-border">
                  <CardHeader className="pb-3">
                    <div className="mb-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", CATEGORY_COLORS[post.category] ?? "bg-muted text-muted-foreground ring-border/60")}>
                        <Tag className="size-3" aria-hidden="true" />
                        {post.category}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-snug group-hover:text-primary transition-colors">
                      {post.title}
                    </CardTitle>
                    <CardDescription className="text-sm line-clamp-3">{post.excerpt}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(post.date)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        {post.readingTime}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Footer — same as landing page */}
      <footer className="border-t border-border/60 bg-card/20 px-6 py-10 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <BrandLogo className="w-4" alt="Hawkeye" />
            </span>
            Hawkeye
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link className="opacity-80 transition-opacity hover:opacity-100" href="/blog">Blog</Link>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#privacy">Privacy Policy</a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="#terms">Terms of Service</a>
            <a className="opacity-80 transition-opacity hover:opacity-100" href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div>© 2026 Hawkeye. Built for developers.</div>
        </div>
      </footer>
    </div>
  );
}
