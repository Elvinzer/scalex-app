"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function DataUnavailable() {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section role="status" aria-live="polite" className="rounded-xl border bg-card p-6">
      <h1 className="text-xl font-semibold">{t("dataUnavailable.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("dataUnavailable.description")}</p>
      <Button className="mt-4" variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {pending ? t("states.loading") : t("actions.retry")}
      </Button>
    </section>
  );
}
