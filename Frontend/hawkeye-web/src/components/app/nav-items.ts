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

/** Project tier nav — pass the projectId from the URL to build scoped hrefs. */
export function getPrimaryNav(projectId: string): AppNavItem[] {
  const p = `/app/${projectId}`;
  return [
    { href: `${p}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `${p}/test-cases`, label: "Test cases", icon: FlaskConical },
    { href: `${p}/runs/live`, label: "Live", icon: PlayCircle },
    { href: `${p}/artifacts`, label: "Artifacts", icon: Archive },
    { href: `${p}/suites`, label: "Test suites", icon: FolderKanban },
    { href: `${p}/vault`, label: "The Vault", icon: KeyRound },
  ];
}

export function getWorkspaceSettingsNav(projectId: string): AppNavItem[] {
  const p = `/app/${projectId}`;
  return [
    { href: `${p}/settings/project`, label: "Project", icon: Layers },
    { href: `${p}/settings/integrations`, label: "Integrations", icon: Settings },
    { href: `${p}/settings/org`, label: "Organization", icon: Building2 },
  ];
}

/** @deprecated Use getPrimaryNav(projectId) for workspace pages. */
export const primaryNav: AppNavItem[] = getPrimaryNav(":projectId");
/** @deprecated Use getWorkspaceSettingsNav(projectId) for workspace pages. */
export const workspaceSettingsNav: AppNavItem[] = getWorkspaceSettingsNav(":projectId");
