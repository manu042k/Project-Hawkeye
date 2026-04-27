import { UnifiedSidebar } from "@/components/app/unified-sidebar";

/** Jira/Azure-style global hub: org-level pages with the same rail as workspace (context strip + org footer). */
export default function GlobalHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full bg-background">
      <div className="hidden shrink-0 md:block">
        <UnifiedSidebar />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
