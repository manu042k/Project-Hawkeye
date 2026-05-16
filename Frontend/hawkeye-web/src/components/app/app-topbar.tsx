"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell, CheckCheck, CircleHelp, Menu, Search,
  CheckCircle2, XCircle, AlertTriangle, Info, X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UnifiedSidebar } from "@/components/app/unified-sidebar";
import {
  useNotificationStore, useNotifications, unreadCount, type Notification, type NotifLevel,
} from "@/lib/notifications/store";
import { useNotificationFeeder } from "@/lib/notifications/feeder";

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

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const LEVEL_ICON: Record<NotifLevel, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />,
  error:   <XCircle     className="size-4 shrink-0 text-rose-400" />,
  warning: <AlertTriangle className="size-4 shrink-0 text-amber-400" />,
  info:    <Info        className="size-4 shrink-0 text-blue-400" />,
};

function NotifItem({ n, onRead, onRemove }: {
  n: Notification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();

  function handleClick() {
    onRead(n.id);
    if (n.href) router.push(n.href);
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 px-4 py-3 transition-colors",
        n.href ? "cursor-pointer hover:bg-muted/40" : "",
        !n.read ? "bg-primary/5" : "",
      )}
      onClick={handleClick}
    >
      {LEVEL_ICON[n.level]}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-tight", !n.read && "font-medium")}>{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{formatTime(n.createdAt)}</p>
      </div>
      {!n.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(n.id); }}
        className="absolute right-2 top-2 hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function NotificationBell() {
  const { markRead, markAllRead, remove } = useNotificationStore();
  const notifications = useNotifications();
  const count = unreadCount(notifications);
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId;

  useNotificationFeeder();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative text-muted-foreground hover:text-foreground",
        )}
        aria-label="Notifications"
      >
        <Bell className="size-4" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Bell className="size-8 text-muted-foreground/30" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground">
              Run completions and alerts will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="divide-y divide-border/40">
              {notifications.map((n) => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onRead={markRead}
                  onRemove={remove}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {notifications.length > 0 && (
          <div className="border-t border-border/60 px-4 py-2">
            <Link
              href={projectId ? `/app/${projectId}/settings/project` : "/app"}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage alert preferences
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId;

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

          <NotificationBell />

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
