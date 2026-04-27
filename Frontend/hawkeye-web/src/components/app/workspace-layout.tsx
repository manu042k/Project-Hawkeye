"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { useProjectStore } from "@/lib/project/store";

function ProjectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px]">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * When no project is selected, redirect to the global Project Selector (`/app`).
 * We avoid `persist.hasHydrated` so static generation does not require zustand persist on the server.
 */
export function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const current = useProjectStore((s) => s.currentProject);
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient) return;
    // After mount, persist rehydration has typically completed
    if (!useProjectStore.getState().currentProject) {
      const path = window.location.pathname + window.location.search;
      router.replace(
        path && path !== "/app" && path !== "/app/" ? `/app?resume=${encodeURIComponent(path)}` : "/app"
      );
    }
  }, [isClient, router, current]);

  return <ProjectShell>{children}</ProjectShell>;
}
