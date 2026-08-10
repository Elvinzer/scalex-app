"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/i18n/actions";

// The ONLY language control inside the app (§C) — no sidebar picker, no
// header picker, no profile-menu entry. The choice is made once at onboarding
// and lives here afterwards.
export function LanguageForm({
  initialLocale,
  showNewLanguageNotice,
}: {
  initialLocale: Locale;
  showNewLanguageNotice: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("settings.preferences");
  const tStates = useTranslations("common.states");
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [saved, setSaved] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: Locale) {
    const previous = locale;
    setLocale(next);
    setSaved(false);
    startTransition(async () => {
      const result = await setLocaleAction(next);
      if (result.error) {
        setLocale(previous);
        return;
      }
      // revalidatePath invalidates the server cache, but a client-side Server
      // Action call does not refresh the current RSC tree by itself. Refresh
      // explicitly so the root layout, sidebar and current page all resolve
      // the new locale in the same round-trip.
      router.refresh();
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Accounts predating this feature are told once that English exists,
          and can make the note go away. They are never sent back through
          onboarding (§B). */}
      {showNewLanguageNotice && !noticeDismissed && (
        <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("newLanguageNotice")}</p>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            className="shrink-0 text-xs font-bold text-muted-foreground underline hover:text-foreground"
          >
            {t("dismissNotice")}
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("languageLabel")}</span>
        <select
          value={locale}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.value as Locale)}
          className="input min-h-11 w-full max-w-xs"
        >
          {LOCALES.map((value) => (
            <option key={value} value={value}>
              {LOCALE_LABELS[value]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{t("languageHelp")}</span>
      </label>

      {saved && (
        <p className="text-xs font-bold text-state-healthy" role="status">
          {tStates("saved")}
        </p>
      )}
    </div>
  );
}
