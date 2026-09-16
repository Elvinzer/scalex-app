"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { formatReferralMoney } from "@/lib/referrals/format";
import { formatRateBps } from "@/lib/referrals/schema";

import { markReferralPayoutPaid, saveReferralCodeOverride, saveReferralSettings } from "./actions";

type ReferralSettingsCopy = {
  programLabel: string;
  defaultRate: string;
  defaultRateHelp: string;
  save: string;
  saving: string;
  saved: string;
  invalidRate: string;
  saveError: string;
};

type ReferralOverrideCopy = {
  label: string;
  placeholder: string;
  save: string;
  saving: string;
  saved: string;
  invalidRate: string;
  saveError: string;
};

type ReferralPayoutCopy = {
  referenceLabel: string;
  referencePlaceholder: string;
  markPaid: string;
  saving: string;
  saved: string;
  saveError: string;
  confirm: string;
  note: string;
};

export type ReferralFormCopy = {
  settings: ReferralSettingsCopy;
  override: ReferralOverrideCopy;
  payout: ReferralPayoutCopy;
};

export function ReferralSettingsForm({ isEnabled, defaultCommissionRateBps, copy }: { isEnabled: boolean; defaultCommissionRateBps: number; copy: ReferralSettingsCopy }) {
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rate = Number(formData.get("defaultRate"));
    setFeedback(null);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setFeedback({ message: copy.invalidRate, isError: true });
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveReferralSettings({
          isEnabled: formData.get("isEnabled") === "on",
          defaultCommissionRateBps: Math.round(rate * 100),
        });
        setFeedback(result.error ? { message: result.error, isError: true } : { message: copy.saved, isError: false });
      } catch {
        setFeedback({ message: copy.saveError, isError: true });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex items-center gap-3 text-sm font-bold">
        <input type="checkbox" name="isEnabled" defaultChecked={isEnabled} />
        {copy.programLabel}
      </label>
      <label className="flex max-w-xs flex-col gap-1.5 text-sm">
        <span className="font-bold">{copy.defaultRate}</span>
        <span className="text-xs text-muted-foreground">{copy.defaultRateHelp}</span>
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
      {feedback && <p role={feedback.isError ? "alert" : "status"} className={feedback.isError ? "text-sm text-state-critical" : "text-sm text-state-healthy"}>{feedback.message}</p>}
      <Button type="submit" disabled={isPending} className="self-start">{isPending ? copy.saving : copy.save}</Button>
    </form>
  );
}

export function ReferralOverrideForm({ codeId, commissionRateBps, copy }: { codeId: string; commissionRateBps: number | null; copy: ReferralOverrideCopy }) {
  const [value, setValue] = useState(commissionRateBps === null ? "" : String(commissionRateBps / 100));
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const rate = value.trim() === "" ? null : Number(value);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      setFeedback({ message: copy.invalidRate, isError: true });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await saveReferralCodeOverride({
          codeId,
          commissionRateBps: rate === null ? null : Math.round(rate * 100),
        });
        setFeedback(result.error ? { message: result.error, isError: true } : { message: copy.saved, isError: false });
      } catch {
        setFeedback({ message: copy.saveError, isError: true });
      }
    });
  }

  return (
    <div className="flex min-w-[190px] items-center gap-2">
      <label className="sr-only" htmlFor={`override-${codeId}`}>{copy.label}</label>
      <div className="relative flex-1">
        <input id={`override-${codeId}`} type="number" min={0} max={100} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.placeholder} className="min-h-10 w-full rounded-[var(--radius-control)] border border-border bg-background px-2.5 pr-7 text-sm tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={save} disabled={isPending}>{isPending ? copy.saving : copy.save}</Button>
      {feedback && <span className={feedback.isError ? "text-xs text-state-critical" : "text-xs text-state-healthy"} role={feedback.isError ? "alert" : "status"}>{feedback.message}</span>}
    </div>
  );
}

export function ReferralPayoutForm({ accountId, currency, amountCents, copy }: { accountId: string; currency: string; amountCents: number; copy: ReferralPayoutCopy }) {
  const [externalReference, setExternalReference] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function markPaid() {
    setFeedback(null);
    const amount = formatReferralMoney(amountCents, currency);
    if (!window.confirm(copy.confirm.replace("{amount}", amount))) return;
    startTransition(async () => {
      try {
        const result = await markReferralPayoutPaid({
          referrerAccountId: accountId,
          currency,
          externalReference: externalReference.trim() || null,
          note: copy.note,
        });
        setFeedback(result.error ? { message: result.error, isError: true } : { message: copy.saved, isError: false });
      } catch {
        setFeedback({ message: copy.saveError, isError: true });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <span className="font-bold tabular-nums">{formatReferralMoney(amountCents, currency)}</span>
      <label className="sr-only" htmlFor={`payout-ref-${accountId}-${currency}`}>{copy.referenceLabel}</label>
      <input id={`payout-ref-${accountId}-${currency}`} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder={copy.referencePlaceholder} className="min-h-10 w-full rounded-[var(--radius-control)] border border-border bg-background px-2.5 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 sm:w-44" />
      <Button type="button" size="sm" variant="outline" onClick={markPaid} disabled={isPending}>{isPending ? copy.saving : copy.markPaid}</Button>
      {feedback && <span className={feedback.isError ? "text-xs text-state-critical" : "text-xs text-state-healthy"} role={feedback.isError ? "alert" : "status"}>{feedback.message}</span>}
    </div>
  );
}

export function ReferralRateHint({ rateBps }: { rateBps: number }) {
  return <span className="text-xs text-muted-foreground">Effectif : {formatRateBps(rateBps)}</span>;
}
