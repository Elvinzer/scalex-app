"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { EmailCampaignContentScore } from "@/components/email-campaign-content-score";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { EmailCampaignRow } from "@/lib/email-campaigns/types";

import { saveEmailCampaign } from "./actions";

const COUNT_FIELDS = [
  { name: "opens", key: "opens" },
  { name: "clicks", key: "clicks" },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CampaignFormDialog({ campaign, trigger }: { campaign?: EmailCampaignRow; trigger: React.ReactNode }) {
  const t = useTranslations("app.mail");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const numberOrNull = (name: string) => {
      const raw = formData.get(name);
      return raw === "" || raw === null ? null : Number(raw);
    };

    const data = {
      name: String(formData.get("name") ?? ""),
      sentAt: String(formData.get("sentAt") ?? today()),
      subject: subject.trim() || null,
      body: body.trim() || null,
      sends: Number(formData.get("sends") ?? 0),
      opens: numberOrNull("opens"),
      clicks: numberOrNull("clicks"),
    };

    startTransition(async () => {
      const result = await saveEmailCampaign(campaign?.id ?? null, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto">
        <DialogTitle className="text-lg font-bold">
          {campaign ? t("editSend") : t("addSend")}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("sendName")}</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={campaign?.name ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("sendDate")}</span>
              <input
                type="date"
                name="sentAt"
                required
                defaultValue={campaign?.sentAt ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("subjectOptional")}</span>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("bodyLabel")}</span>
            <span className="text-xs text-muted-foreground">{t("bodyHelp")}</span>
            <textarea
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              maxLength={20_000}
              className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <EmailCampaignContentScore subject={subject} body={body} />

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("sends")}</span>
            <input
              type="number"
              name="sends"
              min={0}
              required
              defaultValue={campaign?.sends ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {COUNT_FIELDS.map((field) => (
              <label key={field.name} className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t(`field.${field.key}`)}</span>
                <input
                  type="number"
                  name={field.name}
                  min={0}
                  defaultValue={campaign?.[field.name] ?? ""}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? t("saving") : campaign ? t("save") : t("addSend")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
