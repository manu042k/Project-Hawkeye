"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, CircleHelp, Menu, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import { UnifiedSidebar } from "@/components/app/unified-sidebar";

export type AppTopbarProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  breadcrumbs?: Array<{ label: string; href?: string }>;
};

export function AppTopbar({
  title,
  subtitle,
  rightSlot,
  showSearch,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  breadcrumbs,
}: AppTopbarProps) {
  const { data: session } = useSession();

  return (
    <header className="shrink-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 items-center gap-4 px-6">
        <Sheet>
          <SheetTrigger className={cn(buttonVariants({ variant: "outline", size: "icon" }), "md:hidden")}>
            <Menu className="size-4" aria-hidden="true" />
            <span className="sr-only">Open navigation</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <UnifiedSidebar className="h-full w-72 border-r-0" />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          {breadcrumbs?.length ? (
            <nav aria-label="Breadcrumb" className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {breadcrumbs.map((b, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                const content = b.href ? (
                  <Link className="transition-colors hover:text-foreground" href={b.href}>
                    {b.label}
                  </Link>
                ) : (
                  <span className={cn(isLast ? "text-foreground/90" : "")}>{b.label}</span>
                );
                return (
                  <span key={`${b.label}-${idx}`} className="flex items-center gap-2">
                    {content}
                    {!isLast ? <span className="text-border">/</span> : null}
                  </span>
                );
              })}
            </nav>
          ) : null}

          <div className="flex items-baseline gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p> : null}
          </div>
        </div>

        {showSearch ? (
          <div className="relative hidden w-72 lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label="Search"
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {rightSlot}

          <ThemeToggle />

          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-muted-foreground hover:text-foreground")}
            aria-label="Notifications"
          >
            <Bell className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-muted-foreground hover:text-foreground")}
            aria-label="Help"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>

          <Link href="/app/account" aria-label="Account">
            <Avatar className="size-8 border border-border/60">
              <AvatarImage
                alt={session?.user?.name ? `${session.user.name} avatar` : "Account avatar"}
                src={session?.user?.image ?? ""}
              />
              <AvatarFallback className="text-xs font-medium">
                {(session?.user?.name ?? session?.user?.email ?? "U")
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}

