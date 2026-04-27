import {
  ClipboardList,
  CreditCard,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  KeyRound,
  LayoutDashboard,
  PlayCircle,
  Settings,
  Sparkles,
  User,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/** Footer rail — same on hub + workspace (organization-level links). */
export type GlobalFooterNavItem = AppNavItem & { exact?: boolean };

export const globalFooterNav: GlobalFooterNavItem[] = [
  { href: "/app", label: "All projects", icon: FolderKanban, exact: true },
  { href: "/app/account", label: "Account", icon: User },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/", label: "Marketing site", icon: Home, exact: true },
];

/** Project tier — execution + management loop (UI-flow §2). */
export const primaryNav: AppNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/runs/new", label: "Test configuration", icon: ClipboardList },
  { href: "/app/runs/live", label: "Live execution", icon: PlayCircle },
  { href: "/app/runs/report", label: "Run report", icon: FileText },
  { href: "/app/suites", label: "Test suites", icon: FolderKanban },
  { href: "/app/visual-baselines", label: "Visual baselines", icon: Sparkles },
  { href: "/app/vault", label: "The Vault", icon: KeyRound },
];

/** Account / billing live in `globalFooterNav`; workspace middle nav is execution + integrations only. */
export const workspaceSettingsNav: AppNavItem[] = [
  { href: "/app/settings/integrations", label: "Integrations", icon: Settings },
];

export const brandByPath: Array<{ prefix: string; name: string; subtitle?: string; icon: AppNavItem["icon"] }> = [
  { prefix: "/app/vault", name: "VaultAdmin", subtitle: "Enterprise Tier", icon: KeyRound },
  { prefix: "/app/settings", name: "TechOps SaaS", subtitle: "Enterprise Console", icon: Settings },
  { prefix: "/app/visual-baselines", name: "VisualBaseline", subtitle: "Precision QA Tool", icon: Sparkles },
  { prefix: "/app/suites", name: "QA Engine", subtitle: "Technical v2.4", icon: FolderKanban },
  { prefix: "/app/runs", name: "TestOps Pro", subtitle: "Production Environment", icon: Gauge },
  { prefix: "/app", name: "Hawkeye", subtitle: "Technical Operations", icon: LayoutDashboard },
];
