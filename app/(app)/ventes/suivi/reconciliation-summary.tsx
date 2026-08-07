const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export function ReconciliationSummary({
  failedCount,
  failedAmount,
  orphanCount,
}: {
  failedCount: number;
  failedAmount: number;
  orphanCount: number;
}) {
  if (failedCount === 0 && orphanCount === 0) return null;

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-muted/30 p-5" aria-label="Réconciliation Stripe">
      <div className="grid gap-4 sm:grid-cols-2">
        {failedCount > 0 && (
          <div className="rounded-[var(--radius-control)] bg-state-critical/10 px-4 py-3">
            <p className="text-sm font-bold text-state-critical">
              {failedCount} impayé{failedCount > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-sm text-state-critical">{NUMBER_FORMAT.format(failedAmount)} € à recouvrer</p>
          </div>
        )}
        {orphanCount > 0 && (
          <div className="rounded-[var(--radius-control)] bg-warning-soft px-4 py-3">
            <p className="text-sm font-bold text-warning-text">
              {orphanCount} paiement{orphanCount > 1 ? "s" : ""} à rattacher
            </p>
            <p className="mt-1 text-sm text-warning-text">Ces lignes attendent une vente confirmée.</p>
          </div>
        )}
      </div>
    </section>
  );
}
