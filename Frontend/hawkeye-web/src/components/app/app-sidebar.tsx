"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

import { brandByPath, primaryNav, settingsNav, type AppNavItem } from "./nav-items";

function NavLink({ item, isActive }: { item: AppNavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        isActive && "bg-muted text-primary ring-1 ring-border/60"
      )}
    >
      <Icon className={cn("size-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const brand = brandByPath.find((b) => pathname.startsWith(b.prefix)) ?? brandByPath[brandByPath.length - 1];
  const BrandIcon = brand.icon;

  return (
    <aside
      className={cn(
        "flex h-dvh w-64 flex-col border-r border-border/60 bg-card/20",
        "supports-[backdrop-filter]:bg-background/40",
        className
      )}
    >
      <div className="px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border/60">
            <BrandIcon className="size-4" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-foreground">{brand.name}</div>
            {brand.subtitle ? <div className="mt-0.5 text-xs text-muted-foreground">{brand.subtitle}</div> : null}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}

        <div className="py-3">
          <Separator className="bg-border/60" />
        </div>

        {settingsNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}
      </nav>

      <div className="px-4 pb-4">
        <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground/80">Demo workspace</div>
          <div className="mt-1">Static UI build • no backend</div>
        </div>
      </div>
    </aside>
  );
}

