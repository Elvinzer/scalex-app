"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Channel = "instagram" | "linkedin";

export function CrmMessageTestCreateForm() {
  const t = useTranslations("crm.messageTests");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("instagram");
  const [messageA, setMessageA] = useState("");
  const [messageB, setMessageB] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const canStart = name.trim().length > 0 && messageA.trim().length > 0 && messageB.trim().length > 0;

  async function startTest() {
    if (!canStart || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payloadSignature = JSON.stringify([name.trim(), channel, messageA.trim(), messageB.trim()]);
      if (!idempotencyRef.current || idempotencyRef.current.signature !== payloadSignature) {
        idempotencyRef.current = { signature: payloadSignature, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/crm/message-tests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          variantAMessage: messageA.trim(),
          variantBMessage: messageB.trim(),
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const code = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "";
        if (response.status === 409 && code === "active_test_exists") setError(t("errors.activeExists"));
        else if (response.status === 403) setError(t("errors.access"));
        else setError(t("errors.network"));
        return;
      }
      setConfirmOpen(false);
      setCreated(true);
    } catch {
      setError(t("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <section className="rounded-[var(--radius-card)] border border-state-success/25 bg-state-success/10 p-5" aria-labelledby="message-test-created-title">
        <h2 id="message-test-created-title" className="text-lg font-bold text-state-success">{t("form.createdTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("form.createdBody")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild className="min-h-11"><Link href="/crm/tests">{t("form.viewTests")}</Link></Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { setCreated(false); setName(""); setMessageA(""); setMessageB(""); }}>{t("form.createAnother")}</Button>
        </div>
      </section>
    );
  }

  return (
    <form className="flex max-w-4xl flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setError(null); if (canStart) setConfirmOpen(true); else setError(t("form.required")); }}>
      <label className="flex flex-col gap-2 text-sm font-bold" htmlFor="message-test-name">
        {t("form.name")}
        <input id="message-test-name" value={name} maxLength={120} aria-required="true" placeholder={t("form.namePlaceholder")} onChange={(event) => setName(event.target.value)} className="min-h-12 rounded-[var(--radius-control)] border border-border bg-card px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">{t("form.channel")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["instagram", "linkedin"] as const).map((item) => (
            <Button key={item} type="button" variant={channel === item ? "secondary" : "outline"} aria-pressed={channel === item} className={`min-h-11 ${channel === item ? "border-accent text-foreground" : ""}`} onClick={() => setChannel(item)}>
              {item === "instagram" ? t("form.instagram") : t("form.linkedin")}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as const).map((variant) => {
          const value = variant === "A" ? messageA : messageB;
          const update = variant === "A" ? setMessageA : setMessageB;
          const key = variant === "A" ? "form.variantA" : "form.variantB";
          return (
            <div key={variant} className="flex min-w-0 flex-col gap-2">
              <label htmlFor={`message-test-${variant.toLowerCase()}`} className="text-sm font-bold">{t(key)}</label>
              <textarea id={`message-test-${variant.toLowerCase()}`} value={value} maxLength={5000} rows={5} aria-required="true" onChange={(event) => update(event.target.value)} placeholder={t("form.messagePlaceholder", { token: locale.startsWith("fr") ? "{prénom}" : "{first_name}" })} className="min-h-32 resize-y rounded-[var(--radius-control)] border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15" />
              <p className="text-xs text-muted-foreground">{t("form.characters", { count: value.length })}</p>
              <details className="rounded-[var(--radius-control)] border border-border">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("form.preview")}</summary>
                <p className="whitespace-pre-wrap border-t border-border bg-muted/30 p-3 text-sm">{value || " "}</p>
              </details>
            </div>
          );
        })}
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("form.personalizationHint", { token: locale.startsWith("fr") ? "{prénom}" : "{first_name}" })}</p>

      <section className="grid gap-3 sm:grid-cols-2" aria-labelledby="message-test-settings-title">
        <h2 id="message-test-settings-title" className="sr-only">{t("form.rulesTitle")}</h2>
        <div className="rounded-[var(--radius-control)] bg-muted/50 p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("form.split")}</p><p className="mt-1 font-bold">{t("form.splitValue")}</p></div>
        <div className="rounded-[var(--radius-control)] bg-muted/50 p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("form.observation")}</p><p className="mt-1 font-bold">{t("form.observationValue")}</p></div>
        <div className="rounded-[var(--radius-control)] bg-muted/50 p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("form.metric")}</p><p className="mt-1 font-bold">{t("form.metricValue")}</p></div>
        <p className="self-center text-sm text-muted-foreground">{t("form.audioNote")}</p>
      </section>

      {error && <p role="alert" className="rounded-[var(--radius-control)] bg-state-danger/10 px-3 py-2 text-sm font-bold text-state-danger">{error}</p>}
      {!canStart && !error && <p className="text-sm text-muted-foreground">{t("form.required")}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canStart} className="min-h-11">{t("form.start")}</Button>
        <Button asChild type="button" variant="outline" className="min-h-11"><Link href="/crm/tests">{t("form.cancel")}</Link></Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent aria-describedby="message-test-start-description">
          <DialogTitle className="text-lg font-bold">{t("form.confirmTitle")}</DialogTitle>
          <p id="message-test-start-description" className="mt-2 text-sm text-muted-foreground">{t("form.confirmBody")}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmOpen(false)} disabled={saving}>{t("form.cancel")}</Button>
            <Button type="button" className="min-h-11" onClick={() => void startTest()} disabled={saving}>{saving ? t("form.saving") : t("form.confirmStart")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
