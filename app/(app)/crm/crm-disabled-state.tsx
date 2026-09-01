"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { setCrmEnabled } from "../settings/modules/crm/actions";

export function CrmDisabledState({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("crm.activation");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function activate() {
    setError(null);
    startTransition(async () => {
      const result = await setCrmEnabled({ enabled: true });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return <section className="sticker-card flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center"><p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("disabledEyebrow")}</p><div className="flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-accent-soft text-accent-text" aria-hidden="true">CRM</div><h2 className="text-xl font-bold">{t("disabledTitle")}</h2><p className="max-w-md text-sm text-muted-foreground">{t("disabledDescription")}</p>{isOwner ? <Button type="button" disabled={isPending} onClick={activate}>{isPending ? t("loading") : t("activate")}</Button> : <p className="text-sm font-bold text-muted-foreground">{t("ownerOnly")}</p>}{error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}</section>;
}
