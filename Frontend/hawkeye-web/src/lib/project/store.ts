"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProjectSummary = {
  id: string;
  name: string;
  environment: "production" | "staging" | "local";
  lastRunOk: boolean | null;
};

type ProjectState = {
  /** keyed by user email — each user's last project stored separately */
  projectsByUser: Record<string, ProjectSummary>;
  setProjectForUser: (email: string, p: ProjectSummary | null) => void;
  getProjectForUser: (email: string) => ProjectSummary | null;
  /** legacy: single current project for components that haven't migrated */
  currentProject: ProjectSummary | null;
  setCurrentProject: (p: ProjectSummary | null) => void;
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projectsByUser: {},
      currentProject: null,

      setProjectForUser: (email, p) =>
        set((s) => ({
          projectsByUser: p
            ? { ...s.projectsByUser, [email]: p }
            : Object.fromEntries(Object.entries(s.projectsByUser).filter(([k]) => k !== email)),
          currentProject: p,
        })),

      getProjectForUser: (email) => get().projectsByUser[email] ?? null,

      setCurrentProject: (currentProject) => set({ currentProject }),
    }),
    { name: "hawkeye-project-store" }
  )
);
