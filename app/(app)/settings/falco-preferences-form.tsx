"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";

import { updateFalcoPreferences } from "./actions";

export function FalcoPreferencesForm({ initialReduceAnimations }: { initialReduceAnimations: boolean }) {
  const t = useTranslations("settings.page");
  const [reduceAnimations, setReduceAnimations] = useState(initialReduceAnimations);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setReduceAnimations(next); // optimistic — reverted below if the save fails
    startTransition(async () => {
      const result = await updateFalcoPreferences(next);
      if (result.error) setReduceAnimations(!next);
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">{t("reduceAnimations")}</p>
        <p className="text-xs text-muted-foreground">
          {t("reduceAnimationsHelp")}
        </p>
      </div>
      <Switch checked={reduceAnimations} onCheckedChange={handleChange} disabled={isPending} />
    </label>
  );
}
