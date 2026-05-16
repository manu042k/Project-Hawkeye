"use client";

import * as React from "react";

import { AppSidebar } from "@/components/app/app-sidebar";

/** Shell that renders the sidebar + main content area. Project hydration is handled by [projectId]/layout.tsx. */
export function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  return (
    <div data-print-root className="mx-auto flex h-dvh w-full max-w-[1600px] overflow-hidden">
      <div data-print-hide className="hidden h-full min-h-0 shrink-0 md:block">
        <AppSidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
