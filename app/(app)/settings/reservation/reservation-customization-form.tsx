"use client";

import { Copy, ExternalLink, ImagePlus, Monitor, Palette, RefreshCcw, Smartphone, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  BOOKING_BACKGROUND_PRESETS,
  getAccentContrast,
  QUICK_ACCENTS,
  type BookingPageSettingsData,
  type BookingPageSettingsView,
} from "@/lib/booking-page/config";
import { bookingAssetResponseSchema } from "@/lib/booking-page/schema";
import { PublicBookingPage, type PublicBookingCopy, type PublicEvent } from "@/app/book/[handle]/[slug]/public-booking-page";

import { resetBookingPageSettings, saveBookingPageSettings } from "./actions";

export type ReservationEventOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string;
  durationMinutes: number;
  timeZone: string;
  meetingLabel: string;
  publicHeading: string;
  publicDescription: string;
  confirmationTitle: string;
  confirmationMessage: string;
  bookingInstructions: string;
  publicUrl: string;
};

type Props = {
  initialSettings: BookingPageSettingsView;
  events: ReservationEventOption[];
  initialEventId: string | null;
  initialPublicUrl: string | null;
};

type UploadKind = "background" | "logo" | "side-image" | "side-video";

function storedSettings(value: BookingPageSettingsView): BookingPageSettingsData {
  return {
    theme: value.theme,
    accentColor: value.accentColor,
    backgroundType: value.backgroundType,
    backgroundKey: value.backgroundKey,
    backgroundUrl: value.backgroundUrl,
    overlayOpacity: value.overlayOpacity,
    backgroundPosition: value.backgroundPosition,
    logoUrl: value.logoUrl,
    showCompanyName: value.showCompanyName,
    sideMediaType: value.sideMediaType,
    sideMediaUrl: value.sideMediaUrl,
    sideMediaCaption: value.sideMediaCaption,
    title: value.title,
    subtitle: value.subtitle,
    emoji: value.emoji,
    confirmationMessage: value.confirmationMessage,
  };
}

function inputValue(value: string | null): string {
  return value ?? "";
}

export function ReservationCustomizationForm({ initialSettings, events, initialEventId, initialPublicUrl }: Props) {
  const t = useTranslations("app.booking.customization");
  const tBooking = useTranslations("app.booking");
  const router = useRouter();
  const [settings, setSettings] = useState<BookingPageSettingsView>(initialSettings);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const temporaryPaths = useRef(new Set<string>());

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const publicUrl = selectedEvent?.publicUrl ?? initialPublicUrl;
  const contrast = getAccentContrast(settings.accentColor, settings.theme);
  const canUseSuggestion = contrast.warning && contrast.suggestedAccent !== settings.accentColor;

  const previewEvent = useMemo<PublicEvent>(() => ({
    handle: "preview",
    slug: "preview",
    name: selectedEvent?.name ?? t("previewEventName"),
    description: selectedEvent?.description ?? "",
    durationMinutes: selectedEvent?.durationMinutes ?? 60,
    timeZone: selectedEvent?.timeZone ?? "Europe/Paris",
    meetingLabel: selectedEvent?.meetingLabel ?? "Google Meet",
    meetingUrl: null,
    publicHeading: selectedEvent?.publicHeading ?? t("previewTitle"),
    publicDescription: selectedEvent?.publicDescription ?? t("previewSubtitle"),
    confirmationTitle: selectedEvent?.confirmationTitle ?? t("previewConfirmationTitle"),
    confirmationMessage: selectedEvent?.confirmationMessage ?? t("previewConfirmationMessage"),
    bookingInstructions: selectedEvent?.bookingInstructions ?? "",
    questions: [],
    customization: settings,
  }), [selectedEvent, settings, t]);
  const previewCopy: PublicBookingCopy = {
    confirmationInProgress: tBooking("confirmationInProgress"),
    bookingVerificationInProgress: tBooking("bookingVerificationInProgress"),
    bookingVerificationFailed: tBooking("bookingVerificationFailed"),
  };

  function updateSetting<Key extends keyof BookingPageSettingsData>(key: Key, value: BookingPageSettingsData[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice(null);
    setError(null);
  }

  async function deleteTemporaryPath(path: string | null) {
    if (!path || !temporaryPaths.current.has(path)) return;
    temporaryPaths.current.delete(path);
    await fetch("/api/settings/booking-assets", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }).catch(() => undefined);
  }

  async function uploadAsset(kind: UploadKind, file: File) {
    setError(null);
    setNotice(null);
    setUploading(kind);
    try {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("file", file);
      const response = await fetch("/api/settings/booking-assets", { method: "POST", body: formData });
      const payload = bookingAssetResponseSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !payload.success) {
        setError(t("uploadError"));
        return;
      }
      if (!("path" in payload.data)) {
        setError(payload.data.error);
        return;
      }
      const uploaded = payload.data;
      const previousPath = kind === "background" ? settings.backgroundUrl : kind === "logo" ? settings.logoUrl : settings.sideMediaUrl;
      await deleteTemporaryPath(previousPath);
      temporaryPaths.current.add(uploaded.path);
      if (kind === "background") {
        setSettings((current) => ({ ...current, backgroundType: "upload", backgroundKey: null, backgroundUrl: uploaded.path, backgroundAssetUrl: uploaded.url }));
      } else if (kind === "logo") {
        setSettings((current) => ({ ...current, logoUrl: uploaded.path, logoAssetUrl: uploaded.url }));
      } else {
        setSettings((current) => ({ ...current, sideMediaType: kind === "side-image" ? "image" : "video", sideMediaUrl: uploaded.path, sideMediaAssetUrl: uploaded.url }));
      }
    } catch {
      setError(t("uploadError"));
    } finally {
      setUploading(null);
    }
  }

  function handleFile(kind: UploadKind, file: File | undefined) {
    if (!file) return;
    void uploadAsset(kind, file);
  }

  function clearBackground() {
    void deleteTemporaryPath(settings.backgroundUrl);
    setSettings((current) => ({ ...current, backgroundType: "none", backgroundKey: null, backgroundUrl: null, backgroundAssetUrl: null }));
  }

  function choosePreset(key: string) {
    void deleteTemporaryPath(settings.backgroundUrl);
    setSettings((current) => ({ ...current, backgroundType: "preset", backgroundKey: key, backgroundUrl: null, backgroundAssetUrl: null }));
    setNotice(null);
  }

  function clearLogo() {
    void deleteTemporaryPath(settings.logoUrl);
    setSettings((current) => ({ ...current, logoUrl: null, logoAssetUrl: null }));
  }

  function clearMedia() {
    void deleteTemporaryPath(settings.sideMediaUrl);
    setSettings((current) => ({ ...current, sideMediaType: "none", sideMediaUrl: null, sideMediaAssetUrl: null, sideMediaCaption: null }));
  }

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveBookingPageSettings(storedSettings(settings));
      if (result.error) {
        setError(result.error);
        return;
      }
      temporaryPaths.current.clear();
      setNotice(t("saved"));
      router.refresh();
    });
  }

  function reset() {
    if (!window.confirm(t("resetConfirm"))) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await resetBookingPageSettings();
      if (result.error) {
        setError(result.error);
        return;
      }
      await Promise.all(Array.from(temporaryPaths.current).map((path) => deleteTemporaryPath(path)));
      temporaryPaths.current.clear();
      setNotice(t("resetDone"));
      router.refresh();
    });
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,0.65fr)_minmax(0,1.35fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="sticker-card flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold"><Palette className="size-4 text-accent" /> {t("appearance")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("appearanceHelp")}</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{t(settings.theme === "dark" ? "dark" : "light")}</span>
          </div>

          <div>
            <p className="text-sm font-bold">{t("theme")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["dark", "light"] as const).map((theme) => (
                <button key={theme} type="button" onClick={() => updateSetting("theme", theme)} className={`rounded-[var(--radius-control)] border px-3 py-3 text-left text-sm font-bold transition-colors ${settings.theme === theme ? "border-accent bg-accent/10" : "border-border hover:bg-muted"}`}>
                  <span className={`mr-2 inline-block size-3 rounded-full ${theme === "dark" ? "bg-surface-dark" : "bg-canvas"}`} />
                  {t(theme)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="booking-accent" className="text-sm font-bold">{t("accent")}</label>
            <div className="mt-2 flex gap-2">
              <input id="booking-accent" type="color" value={settings.accentColor} onChange={(event) => updateSetting("accentColor", event.target.value)} className="size-11 cursor-pointer rounded-[var(--radius-control)] border border-border bg-background p-1" aria-label={t("accent")} />
              <input type="text" value={settings.accentColor} onChange={(event) => updateSetting("accentColor", event.target.value)} maxLength={7} className="booking-admin-input font-mono uppercase" aria-label={t("hex")} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("quickPalette")}>
              {QUICK_ACCENTS.map((accent) => (
                <button key={accent.key} type="button" title={t(`accentLabels.${accent.key}`)} aria-label={t(`accentLabels.${accent.key}`)} onClick={() => updateSetting("accentColor", accent.value)} className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${settings.accentColor.toLowerCase() === accent.value ? "border-foreground" : "border-transparent"}`} style={{ background: accent.value }} />
              ))}
            </div>
            {contrast.warning && (
              <div className="mt-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 p-3 text-xs">
                <p className="font-bold text-state-caution">{t("contrastWarning")}</p>
                <p className="mt-1 text-muted-foreground">{t("contrastRatio", { ratio: contrast.ratio.toFixed(1) })}</p>
                {canUseSuggestion && <button type="button" onClick={() => updateSetting("accentColor", contrast.suggestedAccent)} className="mt-2 font-bold text-accent underline">{t("useSuggested", { color: contrast.suggestedAccent })}</button>}
              </div>
            )}
          </div>
        </section>

        <section className="sticker-card flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold">{t("background")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("backgroundHelp")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={settings.backgroundType === "none" ? "default" : "outline"} onClick={clearBackground}>{t("noBackground")}</Button>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold transition-colors hover:bg-muted">
              <Upload className="size-3.5" /> {uploading === "background" ? t("uploading") : t("uploadBackground")}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading !== null} onChange={(event) => { handleFile("background", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BOOKING_BACKGROUND_PRESETS.map((preset) => (
              <button key={preset.key} type="button" onClick={() => choosePreset(preset.key)} className={`group relative min-h-16 overflow-hidden rounded-[var(--radius-control)] border text-left ${settings.backgroundType === "preset" && settings.backgroundKey === preset.key ? "border-accent ring-2 ring-accent/20" : "border-border"}`} style={{ background: preset.background }}>
                <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[10px] font-bold text-white">{t(`backgroundPresets.${preset.key}`)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("overlay")}: {settings.overlayOpacity}%</span><input type="range" min="0" max="70" value={settings.overlayOpacity} onChange={(event) => updateSetting("overlayOpacity", Number(event.target.value))} className="accent-accent" /></label>
            <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("position")}</span><select value={settings.backgroundPosition} onChange={(event) => { if (event.target.value === "center" || event.target.value === "top" || event.target.value === "bottom") updateSetting("backgroundPosition", event.target.value); }} className="booking-admin-input"><option value="center">{t("positionCenter")}</option><option value="top">{t("positionTop")}</option><option value="bottom">{t("positionBottom")}</option></select></label>
          </div>
        </section>

        <section className="sticker-card flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold">{t("logo")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("logoHelp")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 min-w-24 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-border bg-muted px-3">
              {settings.logoAssetUrl ? <Image src={settings.logoAssetUrl} alt={settings.companyName} width={160} height={36} unoptimized className="max-h-9 max-w-40 object-contain" /> : <ImagePlus className="size-5 text-muted-foreground" />}
            </div>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold transition-colors hover:bg-muted">
              <Upload className="size-3.5" /> {uploading === "logo" ? t("uploading") : t("uploadLogo")}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="sr-only" disabled={uploading !== null} onChange={(event) => { handleFile("logo", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
            {settings.logoUrl && <button type="button" onClick={clearLogo} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-bold text-muted-foreground hover:bg-muted"><Trash2 className="size-3.5" /> {t("remove")}</button>}
          </div>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.showCompanyName} onChange={(event) => updateSetting("showCompanyName", event.target.checked)} className="size-4 accent-accent" /> {t("showCompanyName")}</label>
        </section>

        <section className="sticker-card flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold">{t("media")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("mediaHelp")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["none", "image", "video", "embed"] as const).map((type) => (
              <button key={type} type="button" onClick={() => type === "none" ? clearMedia() : updateSetting("sideMediaType", type)} className={`rounded-[var(--radius-control)] border px-2 py-2.5 text-xs font-bold ${settings.sideMediaType === type ? "border-accent bg-accent/10" : "border-border hover:bg-muted"}`}>{t(`mediaTypes.${type}`)}</button>
            ))}
          </div>
          {settings.sideMediaType === "image" && <div className="flex flex-wrap items-center gap-3"><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted"><Upload className="size-3.5" /> {uploading === "side-image" ? t("uploading") : t("uploadImage")}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading !== null} onChange={(event) => { handleFile("side-image", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>{settings.sideMediaUrl && <button type="button" onClick={clearMedia} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-bold text-muted-foreground hover:bg-muted"><Trash2 className="size-3.5" /> {t("remove")}</button>}</div>}
          {settings.sideMediaType === "video" && <div className="flex flex-wrap items-center gap-3"><label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted"><Upload className="size-3.5" /> {uploading === "side-video" ? t("uploading") : t("uploadVideo")}<input type="file" accept="video/mp4" className="sr-only" disabled={uploading !== null} onChange={(event) => { handleFile("side-video", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>{settings.sideMediaUrl && <button type="button" onClick={clearMedia} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-bold text-muted-foreground hover:bg-muted"><Trash2 className="size-3.5" /> {t("remove")}</button>}</div>}
          {settings.sideMediaType === "embed" && <input type="url" value={inputValue(settings.sideMediaUrl)} onChange={(event) => updateSetting("sideMediaUrl", event.target.value || null)} placeholder={t("embedPlaceholder")} className="booking-admin-input" />}
          {settings.sideMediaType !== "none" && <input type="text" value={inputValue(settings.sideMediaCaption)} onChange={(event) => updateSetting("sideMediaCaption", event.target.value || null)} maxLength={120} placeholder={t("captionPlaceholder")} className="booking-admin-input" />}
        </section>

        <section className="sticker-card flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold">{t("texts")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("textsHelp")}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("pageTitle")}</span><input type="text" value={inputValue(settings.title)} onChange={(event) => updateSetting("title", event.target.value || null)} maxLength={120} placeholder={t("pageTitlePlaceholder")} className="booking-admin-input" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("pageSubtitle")}</span><textarea value={inputValue(settings.subtitle)} onChange={(event) => updateSetting("subtitle", event.target.value || null)} maxLength={240} rows={2} placeholder={t("pageSubtitlePlaceholder")} className="booking-admin-input resize-y" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("emoji")}</span><input type="text" value={inputValue(settings.emoji)} onChange={(event) => updateSetting("emoji", event.target.value || null)} maxLength={8} placeholder="✨" className="booking-admin-input" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("confirmationMessage")}</span><textarea value={inputValue(settings.confirmationMessage)} onChange={(event) => updateSetting("confirmationMessage", event.target.value || null)} maxLength={300} rows={3} placeholder={t("confirmationPlaceholder")} className="booking-admin-input resize-y" /></label>
        </section>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
          <Button type="button" onClick={save} disabled={isPending || uploading !== null}>{isPending ? t("saving") : t("save")}</Button>
          <Button type="button" variant="outline" onClick={reset} disabled={isPending || uploading !== null}><RefreshCcw className="size-4" /> {t("reset")}</Button>
          {notice && <span className="text-xs font-bold text-state-healthy" role="status">{notice}</span>}
          {error && <span className="text-xs font-bold text-state-critical" role="alert">{error}</span>}
        </div>
      </div>

      <section className="sticky top-5 flex min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-muted/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t("preview")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("previewHelp")}</p>
          </div>
          <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-background p-1">
            <button type="button" onClick={() => setPreviewMode("desktop")} className={`flex size-8 items-center justify-center rounded text-muted-foreground ${previewMode === "desktop" ? "bg-accent text-foreground" : "hover:bg-muted"}`} aria-label={t("desktopPreview")}><Monitor className="size-4" /></button>
            <button type="button" onClick={() => setPreviewMode("mobile")} className={`flex size-8 items-center justify-center rounded text-muted-foreground ${previewMode === "mobile" ? "bg-accent text-foreground" : "hover:bg-muted"}`} aria-label={t("mobilePreview")}><Smartphone className="size-4" /></button>
          </div>
        </div>

        {events.length > 0 ? (
          <label className="flex flex-col gap-1.5 text-xs font-bold"><span>{t("eventToPreview")}</span><select value={selectedEvent?.id ?? ""} onChange={(event) => setSelectedEventId(event.target.value)} className="booking-admin-input"><option value="">{t("selectEvent")}</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.status === "active" ? t("eventActive") : t("eventDraft")}</option>)}</select></label>
        ) : <p className="rounded-[var(--radius-control)] border border-dashed border-border p-3 text-xs text-muted-foreground">{t("noEvents")}</p>}

        <div className="overflow-auto rounded-[var(--radius-card)] border border-border bg-[#202126] p-3 sm:p-5">
          <div className={`mx-auto overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-black shadow-2xl transition-all ${previewMode === "mobile" ? "max-w-[390px]" : "w-full"}`}>
            <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-black/40 px-3"><span className="size-2 rounded-full bg-[#e8663c]" /><span className="size-2 rounded-full bg-white/25" /><span className="size-2 rounded-full bg-white/25" /><span className="ml-2 h-3 flex-1 rounded bg-white/10" /></div>
            <div className="pointer-events-none select-none"><PublicBookingPage event={previewEvent} preview copy={previewCopy} /></div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {publicUrl ? <Button asChild variant="outline" size="sm"><Link href={publicUrl} target="_blank"><ExternalLink className="size-3.5" /> {t("viewPage")}</Link></Button> : <Button variant="outline" size="sm" disabled><ExternalLink className="size-3.5" /> {t("viewPage")}</Button>}
          <Button type="button" variant="outline" size="sm" onClick={() => void copyPublicUrl()} disabled={!publicUrl}><Copy className="size-3.5" /> {copied ? t("copied") : t("copyLink")}</Button>
        </div>
      </section>
    </div>
  );
}
