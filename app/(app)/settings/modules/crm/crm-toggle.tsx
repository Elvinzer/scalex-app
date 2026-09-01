"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { setCrmEnabled } from "./actions";

export function CrmToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations("crm.activation");
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setCrmEnabled({ enabled: next });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEnabled(next);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={isPending} onClick={() => update(!isEnabled)}>
        {isEnabled ? t("disable") : t("activate")}
      </Button>
      {isEnabled && <span className="rounded-full bg-state-healthy/10 px-3 py-1 text-sm font-bold text-state-healthy">{t("enabled")}</span>}
      {error && <p className="basis-full text-sm font-bold text-state-critical" role="alert">{error}</p>}
    </div>
  );
}
