"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProjectSummary = {
  id: string;
  name: string;
  environment: "production" | "staging" | "local";
  /** Last run aggregate for display */
  lastRunOk: boolean | null;
};

type ProjectState = {
  currentProject: ProjectSummary | null;
  setCurrentProject: (p: ProjectSummary | null) => void;
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (currentProject) => set({ currentProject }),
    }),
    { name: "hawkeye-current-project" }
  )
);
