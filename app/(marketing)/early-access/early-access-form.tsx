"use client";

import { z } from "zod";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";

type Status = "idle" | "sending" | "success" | "error";

const responseSchema = z.object({ ok: z.literal(true) });

function queryValue(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim();
  return value || null;
}

function getTrackingProperties(locale: "fr" | "en"): Record<string, unknown> {
  if (typeof window === "undefined") return { locale };

  const params = new URLSearchParams(window.location.search);
  return {
    locale,
    source: queryValue(params, "source") ?? "podcast",
    utm_source: queryValue(params, "utm_source"),
    utm_medium: queryValue(params, "utm_medium"),
    utm_campaign: queryValue(params, "utm_campaign"),
    utm_content: queryValue(params, "utm_content"),
    utm_term: queryValue(params, "utm_term"),
  };
}

export function EarlyAccessForm() {
  const t = useTranslations("earlyAccess");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const trackedStart = useRef(false);

  useEffect(() => {
    trackClient("early_access_page_view", getTrackingProperties(locale));
  }, [locale]);

  function trackFormStart(field: "first_name" | "email") {
    if (trackedStart.current) return;
    trackedStart.current = true;
    trackClient("early_access_form_start", { ...getTrackingProperties(locale), field });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const trackingProperties = getTrackingProperties(locale);
    trackClient("early_access_submit", trackingProperties);

    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch("/api/public/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          email: email.trim(),
          locale,
          source: queryValue(params, "source") ?? "podcast",
          utmSource: queryValue(params, "utm_source"),
          utmMedium: queryValue(params, "utm_medium"),
          utmCampaign: queryValue(params, "utm_campaign"),
          utmContent: queryValue(params, "utm_content"),
          utmTerm: queryValue(params, "utm_term"),
          referrer: document.referrer || null,
        }),
      });
      const responseBody: unknown = await response.json();

      if (!response.ok || !responseSchema.safeParse(responseBody).success) {
        setStatus("error");
        return;
      }
    } catch {
      setStatus("error");
      return;
    }

    setStatus("success");
    trackClient("early_access_success", trackingProperties);
  }

  if (status === "success") {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-text" aria-hidden="true">
          <span className="text-xl font-bold">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground">{t("form.successTitle")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("form.successDescription")}</p>
        <Button asChild variant="outline" className="mt-2 w-fit rounded-[12px] px-5">
          <Link href="/">{t("form.successHome")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form id="early-access-form" onSubmit={handleSubmit} className="flex flex-col gap-5" aria-describedby="early-access-form-note">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("form.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("form.description")}</p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="early-access-first-name">
          <span className="font-semibold text-foreground">{t("form.firstName")}</span>
          <input
            id="early-access-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            onFocus={() => trackFormStart("first_name")}
            placeholder={t("form.firstNamePlaceholder")}
            className="min-h-12 rounded-[var(--radius-control)] border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm" htmlFor="early-access-email">
          <span className="font-semibold text-foreground">{t("form.email")}</span>
          <input
            id="early-access-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => trackFormStart("email")}
            placeholder={t("form.emailPlaceholder")}
            className="min-h-12 rounded-[var(--radius-control)] border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </label>
      </div>

      {status === "error" && (
        <p className="rounded-lg border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical" role="alert">
          {t("form.error")}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "sending"} aria-busy={status === "sending"} className="min-h-12 w-full rounded-[12px] px-5 text-[15px]">
        {status === "sending" ? t("form.submitting") : t("form.submit")}
      </Button>

      <p id="early-access-form-note" className="text-xs leading-relaxed text-muted-foreground">
        {t("form.privacy")} {" "}
        <Link href="/politique-de-confidentialite" className="font-semibold text-accent-text underline underline-offset-2 hover:text-foreground">
          {t("form.privacyLink")}
        </Link>
      </p>
    </form>
  );
}
