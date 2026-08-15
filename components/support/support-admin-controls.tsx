"use client";

import { Loader2, RotateCw, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addSupportMessageAction, retrySupportDiscordAction, updateSupportTicketAction } from "@/app/admin/support/actions";
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES, type SupportTicketPriority, type SupportTicketStatus } from "@/lib/support/types";
import { cn } from "@/lib/utils";

type StaffOption = { id: string; email: string; role: "support_agent" | "support_manager" };

export function SupportAdminControls({
  ticketId,
  status,
  priority,
  assignedStaffId,
  staff,
  duplicateOfTicketId,
  notificationStatus,
}: {
  ticketId: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedStaffId: string | null;
  staff: StaffOption[];
  duplicateOfTicketId: string | null;
  notificationStatus: "pending" | "sent" | "failed";
}) {
  const t = useTranslations("support");
  const [nextStatus, setNextStatus] = useState(status);
  const [nextPriority, setNextPriority] = useState(priority);
  const [nextAssignee, setNextAssignee] = useState(assignedStaffId ?? "");
  const [duplicateOf, setDuplicateOf] = useState(duplicateOfTicketId ?? "");
  const [mode, setMode] = useState<"public" | "internal">("public");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateSupportTicketAction({
        ticketId,
        status: nextStatus,
        priority: nextPriority,
        assignedStaffId: nextAssignee || null,
        duplicateOfTicketId: duplicateOf || null,
      });
      setFeedback(result.ok ? "saved" : "error");
    });
  }

  function sendMessage() {
    if (!message.trim()) return;
    setMessageError(false);
    startTransition(async () => {
      const result = await addSupportMessageAction({ ticketId, body: message, visibility: mode });
      if (result.ok) setMessage("");
      else setMessageError(true);
    });
  }

  function retryDiscord() {
    startTransition(async () => {
      await retrySupportDiscordAction(ticketId);
    });
  }

  return (
    <div className="space-y-5">
      <section className="sticker-card p-5" aria-labelledby="support-admin-assignment">
        <h2 id="support-admin-assignment" className="text-sm font-bold">{t("admin.detail.assignment")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted-foreground"><span>{t("admin.detail.status")}</span><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as SupportTicketStatus)} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">{SUPPORT_TICKET_STATUSES.map((value) => <option key={value} value={value}>{t(`status.${value}`)}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground"><span>{t("admin.detail.priority")}</span><select value={nextPriority} onChange={(event) => setNextPriority(event.target.value as SupportTicketPriority)} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">{SUPPORT_TICKET_PRIORITIES.map((value) => <option key={value} value={value}>{t(`priority.${value}`)}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground"><span>{t("admin.detail.assignedTo")}</span><select value={nextAssignee} onChange={(event) => setNextAssignee(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"><option value="">{t("admin.detail.none")}</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground"><span>{t("admin.detail.duplicateOf")}</span><input value={duplicateOf} onChange={(event) => setDuplicateOf(event.target.value)} placeholder={t("admin.detail.duplicatePlaceholder")} className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" onClick={save} disabled={isPending} className="min-h-11">{isPending ? <Loader2 className="animate-spin" /> : null}{t("admin.detail.save")}</Button>{feedback === "saved" && <span role="status" className="text-sm font-semibold text-state-healthy">{t("admin.detail.saved")}</span>}{feedback === "error" && <span role="alert" className="text-sm font-semibold text-state-critical">{t("admin.detail.saveError")}</span>}</div>
      </section>

      <section className="sticker-card p-5" aria-labelledby="support-admin-discord">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="support-admin-discord" className="text-sm font-bold">{t("admin.discord.title")}</h2><p className="mt-1 text-xs text-muted-foreground">{t(`admin.discord.${notificationStatus === "sent" ? "sent" : notificationStatus === "failed" ? "failed" : "pending"}`)}</p></div>{notificationStatus !== "sent" && <Button type="button" variant="outline" onClick={retryDiscord} disabled={isPending} className="min-h-11"><RotateCw className={cn(isPending && "animate-spin")} /> {t("admin.discord.retry")}</Button>}</div>
      </section>

      <section className="sticker-card overflow-hidden" aria-labelledby="support-admin-composer">
        <div className="border-b border-border p-5"><h2 id="support-admin-composer" className="text-sm font-bold">{mode === "public" ? t("admin.detail.publicReply") : t("admin.detail.internalNote")}</h2><div className="mt-3 flex gap-2"><button type="button" onClick={() => setMode("public")} aria-pressed={mode === "public"} className={cn("min-h-11 rounded-[var(--radius-control)] border px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-accent-2", mode === "public" ? "border-accent bg-accent text-foreground" : "border-border hover:bg-muted")}>{t("admin.detail.publicReply")}</button><button type="button" onClick={() => setMode("internal")} aria-pressed={mode === "internal"} className={cn("min-h-11 rounded-[var(--radius-control)] border px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-accent-2", mode === "internal" ? "border-accent-2 bg-accent-2 text-white" : "border-border hover:bg-muted")}>{t("admin.detail.internalNote")}</button></div></div>
        <div className="p-5"><textarea value={message} onChange={(event) => { setMessage(event.target.value); setMessageError(false); }} placeholder={t("admin.detail.messagePlaceholder")} rows={5} maxLength={5_000} className="w-full resize-y rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />{messageError && <p role="alert" className="mt-2 text-sm font-semibold text-state-critical">{t("admin.detail.messageError")}</p>}<div className="mt-3 flex justify-end"><Button type="button" onClick={sendMessage} disabled={!message.trim() || isPending} className="min-h-11"><Send /> {isPending ? t("admin.detail.sending") : t("admin.detail.send")}</Button></div></div>
      </section>
    </div>
  );
}
