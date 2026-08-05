"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { formatReferralMoney } from "@/lib/referrals/format";
import { formatRateBps } from "@/lib/referrals/schema";

import { markReferralPayoutPaid, saveReferralCodeOverride, saveReferralSettings } from "./actions";

export function ReferralSettingsForm({ isEnabled, defaultCommissionRateBps }: { isEnabled: boolean; defaultCommissionRateBps: number }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rate = Number(formData.get("defaultRate"));
    setError(null);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError("Le taux doit être compris entre 0 et 100 %.");
      return;
    }
    startTransition(async () => {
      const result = await saveReferralSettings({
        isEnabled: formData.get("isEnabled") === "on",
        defaultCommissionRateBps: Math.round(rate * 100),
      });
      setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex items-center gap-3 text-sm font-bold">
        <input type="checkbox" name="isEnabled" defaultChecked={isEnabled} />
        Programme actif
      </label>
      <label className="flex max-w-xs flex-col gap-1.5 text-sm">
        <span className="font-bold">Taux par défaut</span>
        <span className="text-xs text-muted-foreground">Appliqué aux codes sans override personnel.</span>
        <div className="relative">
          <input
            name="defaultRate"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            defaultValue={defaultCommissionRateBps / 100}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 pr-10 text-sm tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
        </div>
      </label>
      {error && <p role="alert" className="text-sm text-state-critical">{error}</p>}
      <Button type="submit" disabled={isPending} className="self-start">{isPending ? "Enregistrement..." : "Enregistrer le taux"}</Button>
    </form>
  );
}

export function ReferralOverrideForm({ codeId, commissionRateBps }: { codeId: string; commissionRateBps: number | null }) {
  const [value, setValue] = useState(commissionRateBps === null ? "" : String(commissionRateBps / 100));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const rate = value.trim() === "" ? null : Number(value);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      setFeedback("Taux invalide");
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await saveReferralCodeOverride({
        codeId,
        commissionRateBps: rate === null ? null : Math.round(rate * 100),
      });
      setFeedback(result.error ?? "Enregistré");
    });
  }

  return (
    <div className="flex min-w-[190px] items-center gap-2">
      <label className="sr-only" htmlFor={`override-${codeId}`}>Override de commission en pourcentage</label>
      <div className="relative flex-1">
        <input id={`override-${codeId}`} type="number" min={0} max={100} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Défaut" className="min-h-10 w-full rounded-[var(--radius-control)] border border-border bg-background px-2.5 pr-7 text-sm tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending}>{isPending ? "..." : "OK"}</Button>
      {feedback && <span className={feedback === "Enregistré" ? "text-xs text-state-healthy" : "text-xs text-state-critical"} role="status">{feedback}</span>}
    </div>
  );
}

export function ReferralPayoutForm({ accountId, currency, amountCents }: { accountId: string; currency: string; amountCents: number }) {
  const [externalReference, setExternalReference] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function markPaid() {
    setFeedback(null);
    startTransition(async () => {
      const result = await markReferralPayoutPaid({
        referrerAccountId: accountId,
        currency,
        externalReference: externalReference.trim() || null,
        note: "Paiement mensuel enregistré depuis l’administration.",
      });
      setFeedback(result.error ?? "Paiement enregistré");
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <span className="font-bold tabular-nums">{formatReferralMoney(amountCents, currency)}</span>
      <label className="sr-only" htmlFor={`payout-ref-${accountId}-${currency}`}>Référence du virement</label>
      <input id={`payout-ref-${accountId}-${currency}`} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Référence (optionnel)" className="min-h-10 w-full rounded-[var(--radius-control)] border border-border bg-background px-2.5 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 sm:w-44" />
      <Button type="button" size="sm" onClick={markPaid} disabled={isPending}>{isPending ? "..." : "Marquer payé"}</Button>
      {feedback && <span className={feedback === "Paiement enregistré" ? "text-xs text-state-healthy" : "text-xs text-state-critical"} role="status">{feedback}</span>}
    </div>
  );
}

export function ReferralRateHint({ rateBps }: { rateBps: number }) {
  return <span className="text-xs text-muted-foreground">Effectif : {formatRateBps(rateBps)}</span>;
}
