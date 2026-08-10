"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { createReferralCode } from "./actions";

export function ReferralCodeForm() {
  const t = useTranslations("referral");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    setError(null);

    startTransition(async () => {
      const result = await createReferralCode({ code });
      if (result.error) {
        setError(result.error);
        return;
      }
      form.reset();
      window.location.reload();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-bold">{t("codeLabel")}</span>
        <span className="text-xs text-muted-foreground">
          {t("codeHelp")}
        </span>
        <input
          name="code"
          type="text"
          required
          minLength={4}
          maxLength={32}
          autoComplete="off"
          placeholder="CEDRIC-X"
          className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm font-mono uppercase outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-[var(--radius-control)] bg-state-critical-bg px-3 py-2 text-sm text-state-critical">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? t("creating") : t("createCode")}
      </Button>
    </form>
  );
}
