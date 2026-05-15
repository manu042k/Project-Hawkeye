import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Tag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/brand-logo";
import { POSTS, getPost, formatDate } from "@/lib/blog/posts";

const CONTACT_EMAIL = "hello@hawkeye.dev";

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  Engineering:  "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  Product:      "bg-amber-500/10 text-amber-400 ring-amber-500/20",
};

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return { title: `${post.title} — Hawkeye Blog`, description: post.excerpt };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const paragraphs = post.content
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
              <BrandLogo className="w-5" alt="Hawkeye" priority />
            </span>
            <span className="text-base">Hawkeye</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#demo">Demo</Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#features">Features</Link>
            <Link className="font-medium text-foreground" href="/blog">Blog</Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/#faq">FAQ</Link>
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
        <div className="mx-auto max-w-2xl">
          {/* Back link */}
          <Link
            href="/blog"
            className="mb-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All posts
          </Link>

          {/* Post header */}
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", CATEGORY_COLORS[post.category] ?? "bg-muted text-muted-foreground ring-border/60")}>
                <Tag className="size-3" aria-hidden="true" />
                {post.category}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl leading-snug">
              {post.title}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p>
            <div className="mt-5 flex items-center gap-4 text-sm text-muted-foreground border-t border-border/60 pt-5">
              <span>{formatDate(post.date)}</span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden="true" />
                {post.readingTime}
              </span>
            </div>
          </header>

          {/* Post body — rendered as prose blocks */}
          <article className="space-y-5 text-[15px] leading-7 text-foreground/90">
            {paragraphs.map((block, i) => {
              if (block.startsWith("## ")) {
                return (
                  <h2 key={i} className="mt-10 mb-2 text-xl font-semibold tracking-tight text-foreground">
                    {block.slice(3)}
                  </h2>
                );
              }
              if (block.startsWith("```")) {
                const lines = block.split("\n");
                const code = lines.slice(1, lines.lastIndexOf("```")).join("\n");
                return (
                  <pre key={i} className="overflow-x-auto rounded-lg border border-border/60 bg-muted/50 px-4 py-3 font-mono text-sm text-foreground/80">
                    <code>{code}</code>
                  </pre>
                );
              }
              return (
                <p key={i} className="text-muted-foreground leading-7">
                  {block}
                </p>
              );
            })}
          </article>

          {/* CTA at end of post */}
          <div className="mt-14 rounded-xl border border-border/60 bg-card/50 p-6 text-center">
            <p className="font-medium">Want to see Hawkeye run against your app?</p>
            <p className="mt-1 text-sm text-muted-foreground">We&apos;ll walk you through a live demo.</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className={cn(buttonVariants({ variant: "default" }), "mt-4")}
            >
              Get in touch
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/20 px-6 py-10 text-xs text-muted-foreground mt-10">
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
