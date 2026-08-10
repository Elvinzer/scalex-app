"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { saveAnthropicKey } from "./actions";

export function ApiKeyForm() {
  const t = useTranslations("settings.page");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveAnthropicKey(formData);
      setError(result.error);
      if (!result.error) {
        setValue("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">{t("apiKeyLabel")}</span>
        <input
          type="password"
          name="apiKey"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("apiKeyPlaceholder")}
          className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        />
      </label>

      {error && <p className="text-sm text-state-critical">{error}</p>}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? t("saving") : t("saveKey")}
      </Button>
    </form>
  );
}
