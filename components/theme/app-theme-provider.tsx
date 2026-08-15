"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/config";

type AppThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

function clearTheme() {
  const root = document.documentElement;
  root.classList.remove("dark");
  delete root.dataset.theme;
  root.style.colorScheme = "";
}

export function AppThemeProvider({
  children,
  initialPreference,
}: {
  children: React.ReactNode;
  initialPreference: ThemePreference;
}) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    initialPreference === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    setPreference(initialPreference);
  }, [initialPreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      setResolvedTheme(resolveThemePreference(preference, mediaQuery.matches));
    };

    syncTheme();

    if (preference === "system") {
      mediaQuery.addEventListener("change", syncTheme);
    }

    return () => {
      if (preference === "system") {
        mediaQuery.removeEventListener("change", syncTheme);
      }
    };
  }, [preference]);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    return () => clearTheme();
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <div
        className={resolvedTheme === "dark" ? "dark min-h-screen" : "min-h-screen"}
        data-theme-preference={preference}
        data-resolved-theme={resolvedTheme}
      >
        {children}
      </div>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }
  return context;
}
