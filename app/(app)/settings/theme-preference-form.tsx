"use client";

import { MonitorCog, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useAppTheme } from "@/components/theme/app-theme-provider";
import {
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme/config";

import { saveThemePreference } from "./actions";

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: MonitorCog,
} as const;

export function ThemePreferenceForm({ initialPreference }: { initialPreference: ThemePreference }) {
  const t = useTranslations("settings.page");
  const tStates = useTranslations("common.states");
  const { preference, setPreference } = useAppTheme();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextPreference: ThemePreference) {
    const previousPreference = preference || initialPreference;
    setPreference(nextPreference);
    setSaved(false);
    setError(false);

    startTransition(async () => {
      try {
        const result = await saveThemePreference(nextPreference);
        if (!result.error) {
          setSaved(true);
          return;
        }
      } catch {
        // Fall through to the same rollback for a network or database error.
      }

      if (preference !== nextPreference) {
        setPreference(previousPreference);
      }
      setError(true);
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="theme-preference-form">
      <div>
        <p className="text-sm font-bold">{t("themePreference")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("themePreferenceHelp")}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("themePreference")}>
        {THEME_PREFERENCES.map((option) => {
          const Icon = THEME_ICONS[option];
          const selected = preference === option;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => handleChange(option)}
              className={`flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60 ${selected ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-card hover:border-border-hover hover:bg-muted"}`}
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-accent/15" : "bg-muted"}`}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{t(`themeOptions.${option}.label`)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(`themeOptions.${option}.help`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {saved && (
        <p className="text-xs font-bold text-state-healthy" role="status">
          {tStates("saved")}
        </p>
      )}
      {error && (
        <p className="text-xs font-bold text-state-critical" role="alert">
          {t("themePreferenceSaveError")}
        </p>
      )}
    </div>
  );
}
