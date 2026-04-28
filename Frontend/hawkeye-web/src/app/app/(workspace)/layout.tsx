import { WorkspaceChrome } from "@/components/app/workspace-layout";

/** Project-tier layout: sandboxed workspace with sidebar (UI-flow Phase 2 & 3). */
export default function ProjectWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
