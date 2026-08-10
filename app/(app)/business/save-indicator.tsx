import type { SaveStatus } from "./use-debounced-save";
import { useTranslations } from "next-intl";

export function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  const t = useTranslations("business.save");
  if (status === "idle") return null;

  if (status === "saving") {
    return <span className="text-xs font-bold text-muted-foreground">{t("saving")}</span>;
  }

  if (status === "error") {
    return <span className="text-xs font-bold text-state-critical">{error ?? t("error")}</span>;
  }

  return <span className="text-xs font-bold text-state-healthy">{t("saved")}</span>;
}

export function CompletionBadge({ answered, total }: { answered: number; total: number }) {
  const t = useTranslations("business.save");
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
      {answered}/{total} {t("entered")}{answered > 1 ? "s" : ""}
    </span>
  );
}
