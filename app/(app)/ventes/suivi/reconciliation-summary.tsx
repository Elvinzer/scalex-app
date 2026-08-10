import { useLocale, useTranslations } from "next-intl";

export function ReconciliationSummary({
  failedCount,
  failedAmount,
  orphanCount,
}: {
  failedCount: number;
  failedAmount: number;
  orphanCount: number;
}) {
  const locale = useLocale();
  const t = useTranslations("sales");
  if (failedCount === 0 && orphanCount === 0) return null;

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-muted/30 p-5" aria-label={t("stripeReconciliation")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {failedCount > 0 && (
          <div className="rounded-[var(--radius-control)] bg-state-critical/10 px-4 py-3">
            <p className="text-sm font-bold text-state-critical">
              {t("failedCount", { count: failedCount })}
            </p>
            <p className="mt-1 text-sm text-state-critical">{new Intl.NumberFormat(locale).format(failedAmount)} € {t("toRecover")}</p>
          </div>
        )}
        {orphanCount > 0 && (
          <div className="rounded-[var(--radius-control)] bg-warning-soft px-4 py-3">
            <p className="text-sm font-bold text-warning-text">
              {t("orphanCount", { count: orphanCount })}
            </p>
            <p className="mt-1 text-sm text-warning-text">{t("awaitingConfirmedSale")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
