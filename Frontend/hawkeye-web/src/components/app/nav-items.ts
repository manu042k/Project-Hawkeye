import {
  CreditCard,
  FolderKanban,
  Gauge,
  KeyRound,
  LayoutDashboard,
  PlayCircle,
  Settings,
  Sparkles,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const primaryNav: AppNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/runs/live", label: "Test Runs", icon: PlayCircle },
  { href: "/app/suites", label: "Test Suites", icon: FolderKanban },
  { href: "/app/visual-baselines", label: "Visual Baselines", icon: Sparkles },
  { href: "/app/vault", label: "The Vault", icon: KeyRound },
];

export const settingsNav: AppNavItem[] = [
  { href: "/app/settings/integrations", label: "Settings", icon: Settings },
  { href: "/app/settings/billing", label: "Billing", icon: CreditCard },
];

export const brandByPath: Array<{ prefix: string; name: string; subtitle?: string; icon: AppNavItem["icon"] }> = [
  { prefix: "/app/vault", name: "VaultAdmin", subtitle: "Enterprise Tier", icon: KeyRound },
  { prefix: "/app/settings", name: "TechOps SaaS", subtitle: "Enterprise Console", icon: Settings },
  { prefix: "/app/visual-baselines", name: "VisualBaseline", subtitle: "Precision QA Tool", icon: Sparkles },
  { prefix: "/app/suites", name: "QA Engine", subtitle: "Technical v2.4", icon: FolderKanban },
  { prefix: "/app/runs", name: "TestOps Pro", subtitle: "Production Environment", icon: Gauge },
  { prefix: "/app", name: "Hawkeye", subtitle: "Technical Operations", icon: LayoutDashboard },
];

