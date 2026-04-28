"use client";

import * as React from "react";
import { useThemeStore } from "@/lib/theme/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  // Ensure the class is applied before paint to avoid flashes/resets
  // when navigating/back while zustand-persist is still hydrating.
  React.useLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem("hawkeye-theme");
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { theme?: "light" | "dark" } };
        const persistedTheme = parsed?.state?.theme;
        if (persistedTheme === "light" || persistedTheme === "dark") {
          const root = document.documentElement;
          if (persistedTheme === "dark") root.classList.add("dark");
          else root.classList.remove("dark");
        }
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return <>{children}</>;
}

