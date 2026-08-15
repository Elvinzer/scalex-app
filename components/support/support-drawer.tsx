"use client";

import { Camera, Check, Image as ImageIcon, Loader2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SUPPORT_CAPTURE_MAX_BYTES } from "@/lib/support/storage";
import { cn } from "@/lib/utils";

export const SUPPORT_OPEN_EVENT = "minaly:open-support";

export function requestSupportDrawer(): void {
  window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT));
}

type TicketType = "bug" | "feature" | "question";

type FormState = {
  type: TicketType;
  title: string;
  description: string;
  expectedResult: string;
  observedResult: string;
  reproductionSteps: string;
  impact: string;
};

const INITIAL_FORM: FormState = {
  type: "bug",
  title: "",
  description: "",
  expectedResult: "",
  observedResult: "",
  reproductionSteps: "",
  impact: "",
};

function dataUrlToFile(dataUrl: string): File | null {
  try {
    const [header, data] = dataUrl.split(",");
    const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/png";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], "support-capture.png", { type: mime });
  } catch {
    return null;
  }
}

async function captureCurrentScreen(): Promise<{ preview: string; file: File } | null> {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return null;
  const dataUrl = await toPng(main, {
    cacheBust: true,
    pixelRatio: 1,
    filter: (node) => !(node instanceof HTMLElement && node.closest("[data-support-capture-exclude]")),
  });
  const file = dataUrlToFile(dataUrl);
  if (!file || file.size > SUPPORT_CAPTURE_MAX_BYTES) return null;
  return { preview: dataUrl, file };
}

function Field({
  id,
  label,
  value,
  placeholder,
  onChange,
  required = false,
  multiline = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  error?: string;
}) {
  const inputClass = cn(
    "mt-1.5 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12",
    error && "border-state-critical focus-visible:border-state-critical focus-visible:ring-state-critical/15"
  );
  return (
    <div>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {required && <span className="ml-1 text-state-critical" aria-hidden="true">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(inputClass, "resize-y")}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass}
        />
      )}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-state-critical">{error}</p>}
    </div>
  );
}

export function SupportDrawer() {
  const t = useTranslations("support");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [capture, setCapture] = useState<{ preview: string; file: File } | null>(null);
  const [captureState, setCaptureState] = useState<"idle" | "loading" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"title" | "description", string>>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientContext, setClientContext] = useState({ path: "/dashboard", browser: "Browser", width: 0, height: 0 });
  const pathnameRef = useRef("/dashboard");

  useEffect(() => {
    const openHandler = () => {
      pathnameRef.current = window.location.pathname + window.location.search;
      setClientContext({
        path: pathnameRef.current,
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : navigator.userAgent.includes("Safari") ? "Safari" : "Browser",
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setForm(INITIAL_FORM);
      setIdempotencyKey(crypto.randomUUID());
      setCapture(null);
      setCaptureState("idle");
      setFormError(null);
      setFieldErrors({});
      setSuccess(null);
      setSubmitting(false);
      setOpen(true);
    };
    window.addEventListener(SUPPORT_OPEN_EVENT, openHandler);
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, openHandler);
  }, []);

  useEffect(() => {
    if (!open || success) return;
    let cancelled = false;
    setCaptureState("loading");
    void captureCurrentScreen()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setCapture(result);
          setCaptureState("idle");
        } else {
          setCaptureState("error");
        }
      })
      .catch(() => {
        if (!cancelled) setCaptureState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, success]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key === "title" || key === "description") setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
    setFormError(null);
  }

  async function recapture() {
    setCaptureState("loading");
    try {
      const result = await captureCurrentScreen();
      if (!result) {
        setCapture(null);
        setCaptureState("error");
        return;
      }
      setCapture(result);
      setCaptureState("idle");
    } catch {
      setCaptureState("error");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<"title" | "description", string>> = {};
    if (form.title.trim().length < 3) errors.title = t("form.error.validation");
    if (form.description.trim().length < 10) errors.description = t("form.error.validation");
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(t("form.error.validation"));
      return;
    }

    setFormError(null);
    setSubmitting(true);
    const payload = new FormData();
    payload.set("idempotencyKey", idempotencyKey || crypto.randomUUID());
    payload.set("type", form.type);
    payload.set("title", form.title);
    payload.set("description", form.description);
    payload.set("expectedResult", form.expectedResult);
    payload.set("observedResult", form.observedResult);
    payload.set("reproductionSteps", form.reproductionSteps);
    payload.set("impact", form.impact);
    payload.set("pathname", pathnameRef.current);
    payload.set("locale", locale);
    payload.set("viewportWidth", String(window.innerWidth));
    payload.set("viewportHeight", String(window.innerHeight));
    if (capture) payload.set("capture", capture.file);

    try {
      const response = await fetch("/api/support/tickets", { method: "POST", body: payload });
      const result: unknown = await response.json();
      if (!response.ok) {
        const code = typeof result === "object" && result !== null && "error" in result ? result.error : null;
        setFormError(code === "rate_limited" ? t("form.error.rateLimited") : t("form.error.generic"));
        return;
      }
      if (typeof result === "object" && result !== null && "reference" in result && typeof result.reference === "string") {
        setSuccess(result.reference);
      } else {
        setFormError(t("form.error.generic"));
      }
    } catch {
      setFormError(t("form.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent
        data-support-capture-exclude
        className="w-[min(420px,100vw)] max-w-none border-l-0 sm:border-l-2"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <DrawerTitle className="text-lg font-bold">{success ? t("form.success.title") : t("form.title")}</DrawerTitle>
              {!success && <p className="mt-1 text-sm text-muted-foreground">{t("form.description")}</p>}
            </div>
            <DrawerClose asChild>
              <button type="button" aria-label={t("form.success.close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent-2">
                <X className="size-5" />
              </button>
            </DrawerClose>
          </div>

          {success ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-state-healthy/15 text-state-healthy">
                <Check className="size-7" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xl font-bold">{t("form.success.title")}</p>
                <p className="mt-2 text-sm font-bold text-muted-foreground">{t("form.success.reference", { reference: success })}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("form.success.description")}</p>
              </div>
              <Button asChild className="min-h-11">
                <Link href="/support">{t("form.success.view")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" noValidate>
              {formError && <p role="alert" aria-live="assertive" className="mb-4 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical/10 px-3 py-2.5 text-sm font-semibold text-state-critical">{formError}</p>}

              <fieldset>
                <legend className="text-sm font-bold">{t("form.typeLabel")}</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["bug", "feature", "question"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setField("type", type)}
                      aria-pressed={form.type === type}
                      className={cn(
                        "min-h-11 rounded-[var(--radius-control)] border px-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2",
                        form.type === type ? "border-accent bg-accent text-foreground" : "border-border bg-card hover:bg-muted"
                      )}
                    >
                      {t(`form.type.${type}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5 space-y-5">
                <Field id="support-title" label={t("form.titleLabel")} value={form.title} placeholder={t("form.titlePlaceholder")} required onChange={(value) => setField("title", value)} error={fieldErrors.title} />
                <Field id="support-description" label={t("form.descriptionLabel")} value={form.description} placeholder={t("form.descriptionPlaceholder")} required multiline onChange={(value) => setField("description", value)} error={fieldErrors.description} />
                {form.type === "bug" && (
                  <div className="space-y-5 rounded-[var(--radius-card)] border border-border bg-surface-sunken p-3.5">
                    <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("form.type.bug")}</p>
                    <Field id="support-expected" label={t("form.expectedLabel")} value={form.expectedResult} placeholder={t("form.expectedPlaceholder")} onChange={(value) => setField("expectedResult", value)} />
                    <Field id="support-observed" label={t("form.observedLabel")} value={form.observedResult} placeholder={t("form.observedPlaceholder")} onChange={(value) => setField("observedResult", value)} />
                    <Field id="support-steps" label={t("form.stepsLabel")} value={form.reproductionSteps} placeholder={t("form.stepsPlaceholder")} multiline onChange={(value) => setField("reproductionSteps", value)} />
                  </div>
                )}
                <Field id="support-impact" label={`${t("form.impactLabel")} (${t("form.optional")})`} value={form.impact} placeholder={t("form.impactPlaceholder")} multiline onChange={(value) => setField("impact", value)} />
              </div>

              <div className="mt-5 rounded-[var(--radius-card)] border border-border bg-surface-sunken p-3.5">
                <p className="text-sm font-bold">{t("form.contextLabel")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("form.contextHelp")}</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="font-bold text-muted-foreground">{t("form.contextPage")}</dt><dd className="truncate">{clientContext.path}</dd>
                  <dt className="font-bold text-muted-foreground">{t("form.contextBrowser")}</dt><dd>{clientContext.browser}</dd>
                  <dt className="font-bold text-muted-foreground">{t("form.contextViewport")}</dt><dd>{clientContext.width || "..."} × {clientContext.height || "..."}</dd>
                </dl>
              </div>

              <div className="mt-5 rounded-[var(--radius-card)] border border-border p-3.5">
                <div className="flex items-start gap-3">
                  <ImageIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{t("form.capture.label")}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("form.capture.warning")}</p>
                    {captureState === "loading" && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {t("form.sending")}</p>}
                    {captureState === "error" && <p role="status" className="mt-2 text-xs font-semibold text-state-caution">{t("form.capture.unavailable")}</p>}
                    {capture && (
                      <div className="mt-3 overflow-hidden rounded-[var(--radius-control)] border border-border bg-card">
                        <Image src={capture.preview} alt="" width={360} height={180} unoptimized className="max-h-36 w-full object-cover object-top" />
                        <div className="flex items-center justify-between gap-2 p-2">
                          <span className="flex items-center gap-1 text-xs font-bold text-state-healthy"><Check className="size-3.5" /> {t("form.capture.label")}</span>
                          <button type="button" onClick={() => setCapture(null)} className="min-h-9 rounded px-2 text-xs font-bold text-state-critical hover:bg-state-critical/10 focus-visible:outline-2 focus-visible:outline-state-critical">{t("form.capture.remove")}</button>
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={() => void recapture()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-xs font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent-2">
                      <Camera className="size-4" /> {t("form.capture.button")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 -mx-5 mt-6 flex gap-2 border-t border-border bg-card/95 px-5 py-4 backdrop-blur-sm">
                <DrawerClose asChild><Button type="button" variant="outline" className="min-h-11 flex-1">{t("form.cancel")}</Button></DrawerClose>
                <Button type="submit" disabled={captureState === "loading" || submitting} className="min-h-11 flex-1">{submitting ? t("form.sending") : t("form.submit")}</Button>
              </div>
            </form>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function SupportOpenButton({ className }: { className?: string }) {
  const t = useTranslations("support");
  return (
    <Button type="button" className={className} onClick={requestSupportDrawer}>
      {t("page.newTicket")}
    </Button>
  );
}
