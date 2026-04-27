import { UnifiedSidebar } from "@/components/app/unified-sidebar";

/** Jira/Azure-style global hub: org-level pages with the same rail as workspace (context strip + org footer). */
export default function GlobalHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <div className="hidden h-full min-h-0 shrink-0 md:block">
        <UnifiedSidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
