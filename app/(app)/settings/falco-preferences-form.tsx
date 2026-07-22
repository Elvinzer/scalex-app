"use client";

import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";

import { updateFalcoPreferences } from "./actions";

export function FalcoPreferencesForm({ initialReduceAnimations }: { initialReduceAnimations: boolean }) {
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
        <p className="text-sm font-bold">Réduire les animations de Falco</p>
        <p className="text-xs text-muted-foreground">
          Falco reste présent mais anime moins ses bulles (indépendant des réglages de ton système).
        </p>
      </div>
      <Switch checked={reduceAnimations} onCheckedChange={handleChange} disabled={isPending} />
    </label>
  );
}
