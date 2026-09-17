"use client";

import { ArrowUpRight, Puzzle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const dismissalKeyPrefix = "minaly.crm.extension-suggestion.dismissed";

export function CrmExtensionSuggestion({ accountId }: { accountId: string }) {
  const t = useTranslations("crm");
  const [dismissed, setDismissed] = useState(false);
  const dismissalKey = `${dismissalKeyPrefix}:${accountId}`;

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissalKey) === "1");
    } catch {
      // Private browsing can block localStorage. The suggestion remains visible.
    }
  }, [dismissalKey]);

  if (dismissed) return null;

  const hideSuggestion = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissalKey, "1");
    } catch {
      // The local state still hides the suggestion for this render.
    }
  };

  return (
    <aside className="sticker-card flex flex-col gap-4 border-accent-border bg-accent-soft/35 p-4 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="crm-extension-suggestion-title">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-white" aria-hidden="true">
          <Puzzle className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("extension.onboarding.suggestionEyebrow")}</p>
          <h2 id="crm-extension-suggestion-title" className="mt-1 text-base font-bold">{t("extension.onboarding.suggestionTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("extension.onboarding.suggestionDescription")}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <Button asChild className="min-h-10">
          <Link href="/crm/extension">
            {t("extension.onboarding.openGuide")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button type="button" variant="ghost" className="min-h-10" onClick={hideSuggestion}>
          {t("extension.onboarding.hideSuggestion")}
        </Button>
      </div>
    </aside>
  );
}
