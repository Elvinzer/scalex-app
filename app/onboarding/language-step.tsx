"use client";

import { useState, useTransition } from "react";

import { Falco } from "@/components/falco/falco";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/i18n/actions";
import { cn } from "@/lib/utils";

// Step 0 of the onboarding (§B). It sits BEFORE the business questions for one
// reason: Falco has to speak the right language in his very first sentence,
// and every bubble, label and verdict after this point depends on the answer.
//
// It is deliberately not part of the 1..3 ProgressBar — the spec asks for it
// to feel instantaneous, and numbering it "1 of 4" would frame a two-second
// tap as a chore.
//
// The bubble is bilingual by construction: at this exact moment nobody knows
// which language the visitor reads, so showing only one would leave half of
// them guessing. Both lines are hardcoded here rather than translated, on
// purpose — a translated bubble would render in one language only, which is
// the entire problem this screen exists to solve.
export function LanguageStep({
  suggested,
  onChosen,
}: {
  suggested: Locale;
  onChosen: (locale: Locale) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Locale | null>(null);

  function choose(locale: Locale) {
    setChosen(locale);
    // The interface switches immediately — the write is fired in the
    // background rather than awaited, so the transition never waits on a
    // round-trip. setLocaleAction writes the cookie before the DB, so even a
    // failed DB write leaves the user in the language they picked.
    startTransition(async () => {
      await setLocaleAction(locale);
    });
    onChosen(locale);
  }

  return (
    <div
      className={cn(
        // The 150ms opacity transition the spec asks for, on the way out.
        "flex flex-col items-center gap-8 transition-opacity duration-150",
        chosen ? "opacity-0" : "opacity-100"
      )}
    >
      <Falco pose="happy" size="lg" animate="enter" priority />

      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-card px-5 py-4 text-center">
        <p className="text-base leading-6">Salut, moi c&apos;est Falco 👋 On parle en français ou en anglais&nbsp;?</p>
        <p className="text-base leading-6 text-muted-foreground">
          Hey, I&apos;m Falco 👋 Shall we speak French or English?
        </p>
      </div>

      {/* Two text buttons, same size, no flags, no coral: language is not the
          screen's primary action in the design-system sense, it's a fork.
          The browser-detected option carries a stronger border only —
          suggested, never imposed (§B). */}
      <div className="flex w-full max-w-sm gap-3">
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            disabled={isPending}
            aria-pressed={chosen === locale}
            onClick={() => choose(locale)}
            className={cn(
              "min-h-11 flex-1 rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold transition-colors",
              "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              // The spec names --border-strong; the design system's actual
              // "stronger border" token is --border-hover. Using the real one
              // rather than inventing a colour outside the DA.
              locale === suggested ? "border-border-hover" : "border-border"
            )}
          >
            {locale === "fr" ? "Français" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}
