"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { WorkspaceChrome } from "@/components/app/workspace-layout";
import { useProjectStore } from "@/lib/project/store";
import { apiClient } from "@/lib/api/client";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const { currentProject, setCurrentProject, setProjectForUser } = useProjectStore();

  useEffect(() => {
    if (currentProject?.id === projectId) return;

    apiClient.getProject(projectId)
      .then((proj) => {
        const p = { id: proj.id, name: proj.name, environment: "staging" as const, lastRunOk: null };
        setCurrentProject(p);
        if (session?.user?.email) setProjectForUser(session.user.email, p);
      })
      .catch(() => router.replace("/app"));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
