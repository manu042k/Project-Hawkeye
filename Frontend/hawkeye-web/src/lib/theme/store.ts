"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppTheme = "light" | "dark";

type ThemeState = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const next: AppTheme = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
      },
    }),
    { name: "hawkeye-theme" }
  )
);

