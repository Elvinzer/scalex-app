"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function CrmError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The server error is intentionally not shown to the user.
  const t = useTranslations("crm");
  return <div className="sticker-card flex flex-col items-center gap-3 p-8 text-center" role="alert"><p className="font-bold text-state-critical">{t("errors.loadFailed")}</p><Button type="button" variant="outline" onClick={reset}>{t("errors.retry")}</Button></div>;
}
