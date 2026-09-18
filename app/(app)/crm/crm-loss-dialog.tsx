"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { crmLostReasonSchema } from "@/lib/crm/schemas";
import { CRM_LOST_REASONS, type CrmLeadDetails, type CrmLostReason } from "@/lib/crm/types";

import { setOutcomeAction } from "./crm-actions";

export function CrmLossDialog({ lead, open, onOpenChange, onSaved }: { lead: Pick<CrmLeadDetails, "id" | "displayName">; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (reason: CrmLostReason) => void }) {
  const t = useTranslations("crm.detail");
  const [reason, setReason] = useState<CrmLostReason>("pas_le_moment");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await setOutcomeAction({ leadId: lead.id, outcome: "lost", lostReason: reason, note, idempotencyKey });
        if (result.error) {
          setError(result.error);
          return;
        }
        setNote("");
        setIdempotencyKey(globalThis.crypto.randomUUID());
        onSaved(reason);
        onOpenChange(false);
      } catch {
        setError(t("bookingRequestError"));
      }
    });
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!isPending) onOpenChange(nextOpen); }}><DialogContent><DialogTitle>{t("lossTitle", { name: lead.displayName })}</DialogTitle><form onSubmit={submit} className="mt-4 flex flex-col gap-4"><label className="flex flex-col gap-1.5 text-sm font-bold">{t("lossReason")}<select value={reason} onChange={(event) => { const parsed = crmLostReasonSchema.safeParse(event.target.value); if (parsed.success) setReason(parsed.data); }} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">{CRM_LOST_REASONS.map((item) => <option key={item} value={item}>{t(`lossReasons.${item}`)}</option>)}</select></label><label className="flex flex-col gap-1.5 text-sm font-bold">{t("lossNote")}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded-[var(--radius-control)] border border-border bg-background p-3 text-sm font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" /></label>{error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}<div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={() => onOpenChange(false)}>{t("bookingCancel")}</Button><Button type="submit" variant="destructive" className="min-h-11" disabled={isPending}>{isPending ? t("lossSaving") : t("markLost")}</Button></div></form></DialogContent></Dialog>;
}
