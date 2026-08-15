"use client";

import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SupportReplyForm({ ticketId }: { ticketId: string }) {
  const t = useTranslations("support");
  const [body, setBody] = useState("");
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(false);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setBody("");
      window.location.reload();
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-border p-4 sm:p-5">
      <label htmlFor="support-reply" className="text-sm font-bold">{t("ticket.replyLabel")}</label>
      <textarea
        id="support-reply"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setError(false);
        }}
        placeholder={t("ticket.replyPlaceholder")}
        rows={4}
        maxLength={5_000}
        className="mt-2 w-full resize-y rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
      />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-state-critical">{t("ticket.replyError")}</p>}
      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={!body.trim() || sending} className="min-h-11">
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          {sending ? t("ticket.replySending") : t("ticket.replySend")}
        </Button>
      </div>
    </form>
  );
}

