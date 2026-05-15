import {
  Archive,
  Building2,
  CreditCard,
  FlaskConical,
  FolderKanban,
  Home,
  KeyRound,
  LayoutDashboard,
  PlayCircle,
  Settings,
  User,
  Layers,
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
  { href: "/app/test-cases", label: "Test cases", icon: FlaskConical },
  { href: "/app/runs/live", label: "Live", icon: PlayCircle },
  { href: "/app/artifacts", label: "Artifacts", icon: Archive },
  { href: "/app/suites", label: "Test suites", icon: FolderKanban },
  { href: "/app/vault", label: "The Vault", icon: KeyRound },
];

/** Account / billing live in `globalFooterNav`; workspace middle nav is execution + integrations only. */
export const workspaceSettingsNav: AppNavItem[] = [
  { href: "/app/settings/project", label: "Project", icon: Layers },
  { href: "/app/settings/integrations", label: "Integrations", icon: Settings },
  { href: "/app/settings/org", label: "Organization", icon: Building2 },
];
