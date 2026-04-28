"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Activity,
  CreditCard,
  FolderKanban,
  Home,
  Layers,
  Link2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Shield,
  User,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/lib/project/store";
import { cn } from "@/lib/utils";

import { globalFooterNav, primaryNav, workspaceSettingsNav, type AppNavItem, type GlobalFooterNavItem } from "./nav-items";

function useHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(typeof window !== "undefined" ? window.location.hash : "");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return hash;
}

export function isGlobalHubPath(pathname: string) {
  return (
    pathname === "/app" ||
    pathname === "/app/" ||
    pathname.startsWith("/app/account") ||
    pathname.startsWith("/app/billing")
  );
}

function matchPathActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({ item, active }: { item: AppNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        active && "bg-muted text-primary ring-1 ring-border/60"
      )}
    >
      <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function FooterRow({ item, pathname }: { item: GlobalFooterNavItem; pathname: string }) {
  const active = matchPathActive(pathname, item.href, item.exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        active && "bg-muted text-primary ring-1 ring-border/60"
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

type HubKey = "projects" | "account" | "billing";

const accountAnchors: Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }> = [
  { href: "/app/account#overview", label: "Overview", icon: LayoutDashboard },
  { href: "/app/account#profile", label: "Profile", icon: User },
  { href: "/app/account#security", label: "Security", icon: Shield },
  { href: "/app/account#providers", label: "Providers", icon: Link2 },
  { href: "/app/account#team", label: "Team", icon: Users },
];

const billingAnchors: Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }> = [
  { href: "/app/billing#usage", label: "Usage", icon: Activity },
  { href: "/app/billing#subscription", label: "Subscription", icon: CreditCard },
  { href: "/app/billing#profile", label: "Billing profile", icon: User },
];

/** Single rail: contextual block at top · scoped nav · organization globals at bottom. */
export function UnifiedSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const hash = useHash();
  const { status } = useSession();
  const currentProject = useProjectStore((s) => s.currentProject);
  const hub = isGlobalHubPath(pathname);

  let hubKey: HubKey = "projects";
  if (pathname.startsWith("/app/account")) hubKey = "account";
  else if (pathname.startsWith("/app/billing")) hubKey = "billing";

  function scopeActive(item: AppNavItem) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-border/60 bg-card/20 supports-[backdrop-filter]:bg-background/40",
        className
      )}
    >
      <div className="shrink-0 border-b border-border/60 px-4 py-4">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight transition-opacity hover:opacity-90">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-border/60">
            <BrandLogo className="w-6" alt="Hawkeye" priority />
          </span>
          <span className="truncate text-[15px] leading-tight">Hawkeye</span>
        </Link>
      </div>

      <div className="shrink-0 border-b border-border/60 bg-muted/15 px-4 py-4">
        {hub ? (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This page</p>
            {hubKey === "projects" ? (
              <>
                <p className="text-sm font-semibold leading-snug text-foreground">Projects</p>
                <p className="text-xs leading-snug text-muted-foreground">Pick a sandboxed workspace for runs, Vault, and baselines.</p>
              </>
            ) : null}
            {hubKey === "account" ? (
              <>
                <p className="text-sm font-semibold leading-snug text-foreground">Account</p>
                <p className="text-xs leading-snug text-muted-foreground">Profile, team, security, and SSO providers.</p>
              </>
            ) : null}
            {hubKey === "billing" ? (
              <>
                <p className="text-sm font-semibold leading-snug text-foreground">Billing</p>
                <p className="text-xs leading-snug text-muted-foreground">Usage meters, subscription, and billing profile.</p>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current project</p>
            {currentProject ? (
              <>
                <p className="truncate text-sm font-semibold text-foreground">{currentProject.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{currentProject.environment}</p>
                <Link href="/app" className="inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">
                  Switch project
                </Link>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No project selected</p>
            )}
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {hub ? (
          <>
            {hubKey === "projects" ? (
              <>
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Directory</p>
                <NavRow
                  item={{ href: "/app", label: "All projects", icon: FolderKanban }}
                  active={pathname === "/app" || pathname === "/app/"}
                />
                <Link
                  href="/app/dashboard"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Layers className="size-4 shrink-0" aria-hidden />
                  Open last workspace
                </Link>
              </>
            ) : null}

            {hubKey === "account" ? (
              <>
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
                {accountAnchors.map(({ href, label, icon: Icon }) => {
                  const expected = href.includes("#") ? `#${href.split("#")[1]}` : "";
                  const active = expected.length > 0 && hash === expected;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
                        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        active && "bg-muted text-primary ring-1 ring-border/60"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {label}
                    </Link>
                  );
                })}
              </>
            ) : null}

            {hubKey === "billing" ? (
              <>
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
                {billingAnchors.map(({ href, label, icon: Icon }) => {
                  const expected = href.includes("#") ? `#${href.split("#")[1]}` : "";
                  const active = expected.length > 0 && hash === expected;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
                        "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        active && "bg-muted text-primary ring-1 ring-border/60"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {label}
                    </Link>
                  );
                })}
              </>
            ) : null}
          </>
        ) : (
          <>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This project</p>
            {primaryNav.map((item) => (
              <NavRow key={item.href} item={item} active={scopeActive(item)} />
            ))}
            <div className="py-3">
              <Separator className="bg-border/60" />
            </div>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</p>
            {workspaceSettingsNav.map((item) => (
              <NavRow key={item.href} item={item} active={scopeActive(item)} />
            ))}
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-border/60 bg-card/25 px-3 py-4">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Organization</p>
        <div className="space-y-1">
          {globalFooterNav.map((item) => (
            <FooterRow key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div className="mt-3 border-t border-border/60 pt-3">
          {status === "authenticated" ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium tracking-tight transition-colors",
                "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Sign out</span>
            </button>
          ) : (
            <Link
              href="/auth/login"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
                "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <LogIn className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
