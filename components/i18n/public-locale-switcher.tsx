"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { LOCALES, LOCALE_SHORT_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/i18n/actions";
import { cn } from "@/lib/utils";

// Signed-out screens only (§C). An English speaker has to be able to sign up,
// and there is no user row yet to read a preference from — so this is the one
// place outside Réglages where the language can be changed.
//
// Deliberately the plainest control in the design system: text, a hairline
// separator, no flags, no coral, no dropdown. It must read as metadata, not
// as an action competing with "Se connecter".
export function PublicLocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs" role="group" aria-label="Language">
      {LOCALES.map((locale, index) => (
        <span key={locale} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-border">
              |
            </span>
          )}
          <button
            type="button"
            disabled={isPending}
            aria-current={locale === current ? "true" : undefined}
            onClick={() => choose(locale)}
            className={cn(
              "cursor-pointer transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              locale === current ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {LOCALE_SHORT_LABELS[locale]}
          </button>
        </span>
      ))}
    </div>
  );
}
