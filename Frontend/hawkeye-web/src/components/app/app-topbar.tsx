"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleHelp, Menu, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import { AppSidebar } from "./app-sidebar";

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
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
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
            <AppSidebar className="w-72 border-r-0" />
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

          <Link href={pathname.startsWith("/app/settings") ? "/app/settings/billing" : "/app/settings/integrations"}>
            <Avatar className="size-8 border border-border/60">
              <AvatarImage
                alt="User avatar"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDl_AGE7ZijSsRNhLmOGNF1NOGNGE-U9iS_cCZjwLUoAe--FDu0IkeZMdziyeM_dD2-bBfH4Y7he95mO9t8yKtcmK20yhRdSC1Iagi0rslwpiuf5TPHkZjgoBM-Y45xpDon7GEo3u-DduZ8keugkxCWTmivO39GO9IyM5LvX0sHkaOLD9MGdVFiAeY7DsLWmBGqeGDRI9r6loEE_tLaPvkSCu9KJbF-zpI-JK1HWRhebw4kD2aUt3HtobJJZ3_YXGzQDF4puaq1KT4"
              />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}

