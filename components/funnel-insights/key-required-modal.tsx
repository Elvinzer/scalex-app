"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Same centered-overlay shell as StageInsightPanel — shown instead of the
// question flow when the user has no working BYOK key (missing or flagged
// invalid, see lib/agent/validate-key.ts).
export function KeyRequiredModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("diagnostic.insight");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="sticker-card w-full max-w-sm p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-bold">{t("keyRequired")}</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" />
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("keyHelp")}
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings">{t("goSettings")}</Link>
        </Button>
      </div>
    </div>
  );
}
