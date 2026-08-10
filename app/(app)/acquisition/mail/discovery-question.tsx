"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { saveMailDiscoveryAnswer } from "./actions";

// Simplified single-lever version of discovery-conversation.tsx's primary
// yes/no question, reusing the catalog's own email_marketing wording — this
// page doesn't run the full Découverte parcours, just this one question.
export function DiscoveryQuestion() {
  const t = useTranslations("app.mail");
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleNo() {
    startTransition(async () => {
      await saveMailDiscoveryAnswer("absent", {});
    });
  }

  function handleYesSubmit(formData: FormData) {
    const raw = formData.get("listSize");
    const listSize = raw === "" || raw === null ? null : Number(raw);
    startTransition(async () => {
      await saveMailDiscoveryAnswer("active", listSize === null ? {} : { listSize });
    });
  }

  return (
    <div className="sticker-card flex flex-col gap-4 p-6">
      <p className="text-sm font-bold">{t("discoveryQuestion")}</p>

      {answer === null && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAnswer("yes")} disabled={isPending}>
            {t("yes")}
          </Button>
          <Button variant="secondary" onClick={handleNo} disabled={isPending}>
            {t("no")}
          </Button>
        </div>
      )}

      {answer === "yes" && (
        <form action={handleYesSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("listSizeQuestion")}</span>
            <input
              type="number"
              name="listSize"
              min={0}
              autoFocus
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? t("saving") : t("confirm")}
          </Button>
        </form>
      )}
    </div>
  );
}
