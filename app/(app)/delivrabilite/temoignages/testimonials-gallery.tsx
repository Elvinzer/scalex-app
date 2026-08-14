"use client";

// Testimonial assets are short-lived signed URLs from a private Supabase
// bucket. next/image cannot optimize an account-specific URL without making
// every possible storage host a trusted remote pattern.
/* eslint-disable @next/next/no-img-element */

import { Clipboard, Download, ExternalLink, Filter, Image as ImageIcon, Link2, Pencil, Play, Plus, Quote, Trash2, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import { KpiTile } from "@/components/kpi-tile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DeliveryOffer, JourneyOption, TestimonialData, TestimonialRecord } from "@/lib/deliverability/queries";
import type { TestimonialMediaType } from "@/lib/deliverability/types";

import { deleteTestimonial, saveTestimonial } from "../actions";

const inputClass = "min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";
const MEDIA_TYPES: TestimonialMediaType[] = ["photo", "video", "link", "text"];

type Draft = {
  id: string | null;
  mediaType: TestimonialMediaType;
  fileUrl: string | null;
  fileLabel: string;
  externalUrl: string;
  text: string;
  clientName: string;
  clientJourneyId: string;
  offerId: string;
  resultText: string;
  consent: boolean;
  tags: string;
  date: string;
};

type Prefill = { journeyId: string | null; clientName: string | null; offerId: string | null };

function blankDraft(prefill: Prefill): Draft {
  return {
    id: null,
    mediaType: "text",
    fileUrl: null,
    fileLabel: "",
    externalUrl: "",
    text: "",
    clientName: prefill.clientName ?? "",
    clientJourneyId: prefill.journeyId ?? "",
    offerId: prefill.offerId ?? "",
    resultText: "",
    consent: false,
    tags: "",
    date: new Date().toISOString().slice(0, 10),
  };
}

function draftFromRecord(record: TestimonialRecord): Draft {
  return {
    id: record.id,
    mediaType: record.mediaType,
    fileUrl: record.filePath,
    fileLabel: record.filePath?.split("/").at(-1) ?? "",
    externalUrl: record.externalUrl ?? "",
    text: record.text ?? "",
    clientName: record.clientName,
    clientJourneyId: record.clientJourneyId ?? "",
    offerId: record.offerId ?? "",
    resultText: record.resultText ?? "",
    consent: record.consent,
    tags: record.tags.join(", "),
    date: record.date,
  };
}

function mediaLabel(type: TestimonialMediaType, t: (key: string) => string) {
  return t(`testimonials.${type === "text" ? "textOnly" : type}`);
}

function TestimonialCard({ record, onEdit, onOpen, onDelete }: { record: TestimonialRecord; onEdit: () => void; onOpen: () => void; onDelete: () => void }) {
  const t = useTranslations("deliverability");
  return (
    <article className="group overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-sm transition hover:-translate-y-px hover:shadow-md">
      <button type="button" onClick={onOpen} className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted text-left focus-visible:outline-2 focus-visible:outline-accent">
        {record.mediaType === "photo" && record.fileUrl ? <img src={record.fileUrl} alt={record.clientName} className="size-full object-cover" /> : record.mediaType === "video" && record.fileUrl ? <><video src={record.fileUrl} className="size-full object-cover" muted preload="metadata" /><span className="absolute inset-0 flex items-center justify-center"><span className="flex size-12 items-center justify-center rounded-full bg-card/90 text-foreground shadow"><Play className="ml-0.5 size-5" aria-hidden="true" /></span></span></> : record.mediaType === "link" ? <Link2 className="size-10 text-muted-foreground" aria-hidden="true" /> : <Quote className="size-10 text-muted-foreground" aria-hidden="true" />}
        <span className="absolute top-3 left-3 rounded-full border border-border bg-card/90 px-2 py-1 text-[11px] font-bold">{mediaLabel(record.mediaType, t)}</span>
        <span className={`absolute top-3 right-3 rounded-full px-2 py-1 text-[11px] font-bold ${record.consent ? "bg-state-healthy/15 text-state-healthy" : "bg-muted text-muted-foreground"}`}>{record.consent ? t("testimonials.publicReady") : t("testimonials.private")}</span>
      </button>
      <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-bold">{record.clientName}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{record.resultText ?? record.date}</p></div><div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={t("testimonials.edit")} onClick={onEdit}><Pencil className="size-4" aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={t("testimonials.delete")} onClick={onDelete}><Trash2 className="size-4" aria-hidden="true" /></Button></div></div>{record.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{record.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">{tag}</span>)}</div>}</div>
    </article>
  );
}

function TestimonialForm({ draft, setDraft, journeys, offers, onClose, onSaved }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; journeys: JourneyOption[]; offers: DeliveryOffer[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("deliverability");
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.set("kind", draft.mediaType === "photo" ? "photo" : "video");
    formData.set("file", file);
    try {
      const response = await fetch("/api/delivrabilite/testimonials/upload", { method: "POST", body: formData });
      const payload = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !payload.path) { setError(payload.error ?? t("errors.upload")); return; }
      setDraft((current) => ({ ...current, fileUrl: payload.path ?? null, fileLabel: file.name }));
    } catch {
      setError(t("errors.upload"));
    } finally {
      setUploading(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTestimonial({
        ...draft,
        fileLabel: undefined,
        externalUrl: draft.externalUrl || null,
        text: draft.text || null,
        clientJourneyId: draft.clientJourneyId || null,
        offerId: draft.offerId || null,
        resultText: draft.resultText || null,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      if (result.error) { setError(result.error); return; }
      onSaved();
      onClose();
    });
  }

  return <form onSubmit={submit} className="flex flex-col gap-4"><DialogTitle className="text-xl font-bold">{draft.id ? t("testimonials.edit") : t("testimonials.add")}</DialogTitle><div className="grid gap-2 sm:grid-cols-2">{MEDIA_TYPES.map((type) => <button type="button" key={type} onClick={() => setDraft((current) => ({ ...current, mediaType: type }))} className={`flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-bold ${draft.mediaType === type ? "border-accent bg-accent/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-border-hover"}`}>{type === "photo" ? <ImageIcon className="size-4" aria-hidden="true" /> : type === "video" ? <Video className="size-4" aria-hidden="true" /> : type === "link" ? <Link2 className="size-4" aria-hidden="true" /> : <Quote className="size-4" aria-hidden="true" />}{mediaLabel(type, t)}</button>)}</div>{(draft.mediaType === "photo" || draft.mediaType === "video") && <label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.file")}<input type="file" accept={draft.mediaType === "photo" ? "image/jpeg,image/png,image/webp" : "video/mp4"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm" />{draft.fileLabel && <span className="text-xs text-muted-foreground">{draft.fileLabel}</span>}<span className="text-xs font-normal text-muted-foreground">{draft.mediaType === "photo" ? t("testimonials.fileHelp") : t("testimonials.videoHelp")}</span></label>}{draft.mediaType === "link" && <label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.externalUrl")}<input type="url" value={draft.externalUrl} onChange={(event) => setDraft((current) => ({ ...current, externalUrl: event.target.value }))} placeholder={t("testimonials.externalUrlPlaceholder")} className={inputClass} /></label>}<div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.linkClient")}<select value={draft.clientJourneyId} onChange={(event) => { const journey = journeys.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, clientJourneyId: event.target.value, clientName: journey?.clientName ?? current.clientName, offerId: journey?.offerId ?? current.offerId })); }} className={inputClass}><option value="">{t("testimonials.freeClient")}</option>{journeys.map((journey) => <option key={journey.id} value={journey.id}>{journey.clientName}</option>)}</select></label><label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.offer")}<select value={draft.offerId} onChange={(event) => setDraft((current) => ({ ...current, offerId: event.target.value }))} className={inputClass}><option value="">{t("testimonials.chooseOffer")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label></div><label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.client")}<input required value={draft.clientName} onChange={(event) => setDraft((current) => ({ ...current, clientName: event.target.value }))} placeholder={t("testimonials.clientPlaceholder")} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.date")}<input type="date" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></label><label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.result")}<input value={draft.resultText} onChange={(event) => setDraft((current) => ({ ...current, resultText: event.target.value }))} placeholder={t("testimonials.resultPlaceholder")} className={inputClass} /></label></div>{(draft.mediaType === "text" || draft.text) && <label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.text")}<textarea rows={4} value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} placeholder={t("testimonials.textPlaceholder")} className={`${inputClass} py-3`} /></label>}<label className="flex flex-col gap-1.5 text-sm font-bold">{t("testimonials.tags")}<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder={t("testimonials.tagsPlaceholder")} className={inputClass} /></label><label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold"><input type="checkbox" checked={draft.consent} onChange={(event) => setDraft((current) => ({ ...current, consent: event.target.checked }))} />{t("testimonials.consent")}</label><p className="text-xs text-muted-foreground">{t("testimonials.consentWarning")}</p>{error && <p role="alert" className="text-sm font-bold text-state-critical">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("client.cancel")}</Button><Button type="submit" disabled={isPending || uploading}>{uploading ? t("testimonials.uploading") : draft.id ? t("testimonials.update") : t("testimonials.save")}</Button></div></form>;
}

export function TestimonialsGallery({ initialData, journeys, offers, prefill }: { initialData: TestimonialData; journeys: JourneyOption[]; offers: DeliveryOffer[]; prefill: Prefill }) {
  const t = useTranslations("deliverability");
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState({ offerId: "", mediaType: "", consent: "", tag: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lightbox, setLightbox] = useState<TestimonialRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(prefill));
  const [, startTransition] = useTransition();
  useEffect(() => setData(initialData), [initialData]);
  useEffect(() => { if (prefill.journeyId || prefill.clientName) { setDraft(blankDraft(prefill)); setDialogOpen(true); } }, [prefill]);

  const tags = useMemo(() => [...new Set(data.testimonials.flatMap((record) => record.tags))].sort(), [data.testimonials]);
  const filtered = data.testimonials.filter((record) => (!filters.offerId || record.offerId === filters.offerId) && (!filters.mediaType || record.mediaType === filters.mediaType) && (!filters.consent || String(record.consent) === filters.consent) && (!filters.tag || record.tags.includes(filters.tag)));

  function refresh() { router.refresh(); }
  function edit(record: TestimonialRecord) { setDraft(draftFromRecord(record)); setDialogOpen(true); }
  function remove(record: TestimonialRecord) {
    if (!window.confirm(t("testimonials.deleteConfirm"))) return;
    startTransition(async () => { const result = await deleteTestimonial(record.id); if (!result.error) refresh(); });
  }
  function copyText(record: TestimonialRecord) { if (record.text) void navigator.clipboard.writeText(record.text); }

  return <div className="flex flex-col gap-5"><div className="grid gap-3 md:grid-cols-3"><KpiTile label={t("testimonials.total")} value={String(data.totalCount)} /><KpiTile label={t("testimonials.consented")} value={String(data.consentedCount)} tone={data.consentedCount > 0 ? "positive" : "default"} /><KpiTile label={t("testimonials.thisMonth")} value={String(data.thisMonthCount)} /></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold"><Filter className="size-4" aria-hidden="true" />{t("testimonials.filters")}</div><Button type="button" onClick={() => { setDraft(blankDraft({ journeyId: null, clientName: null, offerId: null })); setDialogOpen(true); }}><Plus className="size-4" aria-hidden="true" />{t("testimonials.add")}</Button></div><div className="grid gap-2 rounded-[var(--radius-card)] border border-border bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-4"><select aria-label={t("testimonials.offer")} value={filters.offerId} onChange={(event) => setFilters((current) => ({ ...current, offerId: event.target.value }))} className={inputClass}><option value="">{t("testimonials.allOffers")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select><select aria-label={t("testimonials.media")} value={filters.mediaType} onChange={(event) => setFilters((current) => ({ ...current, mediaType: event.target.value }))} className={inputClass}><option value="">{t("testimonials.allTypes")}</option>{MEDIA_TYPES.map((type) => <option key={type} value={type}>{mediaLabel(type, t)}</option>)}</select><select aria-label={t("testimonials.consent")} value={filters.consent} onChange={(event) => setFilters((current) => ({ ...current, consent: event.target.value }))} className={inputClass}><option value="">{t("testimonials.allConsent")}</option><option value="true">{t("testimonials.consentedOnly")}</option><option value="false">{t("testimonials.privateOnly")}</option></select><select aria-label={t("testimonials.tags")} value={filters.tag} onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))} className={inputClass}><option value="">{t("testimonials.allTags")}</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></div>{filtered.length === 0 ? <div className="sticker-card p-10 text-center"><p className="text-sm font-bold">{data.testimonials.length === 0 ? t("testimonials.none") : t("testimonials.empty")}</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((record) => <TestimonialCard key={record.id} record={record} onEdit={() => edit(record)} onOpen={() => setLightbox(record)} onDelete={() => remove(record)} />)}</div>}<Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><TestimonialForm draft={draft} setDraft={setDraft} journeys={journeys} offers={offers} onClose={() => setDialogOpen(false)} onSaved={refresh} /></DialogContent></Dialog><Dialog open={Boolean(lightbox)} onOpenChange={(open) => { if (!open) setLightbox(null); }}><DialogContent className="max-w-3xl"><div className="flex items-center justify-between gap-3"><DialogTitle className="text-xl font-bold">{lightbox?.clientName}</DialogTitle><Button type="button" variant="ghost" size="icon" aria-label={t("testimonials.lightboxClose")} onClick={() => setLightbox(null)}><X className="size-5" aria-hidden="true" /></Button></div>{lightbox && <div className="mt-4 flex flex-col gap-4">{lightbox.mediaType === "photo" && lightbox.fileUrl && <img src={lightbox.fileUrl} alt={lightbox.clientName} className="max-h-[65vh] w-full rounded-[var(--radius-control)] object-contain" />}{lightbox.mediaType === "video" && lightbox.fileUrl && <video src={lightbox.fileUrl} controls className="max-h-[65vh] w-full rounded-[var(--radius-control)]" />}{lightbox.mediaType === "link" && lightbox.externalUrl && <a href={lightbox.externalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent underline"><ExternalLink className="size-4" aria-hidden="true" />{t("testimonials.open")}</a>}{lightbox.text && <p className="whitespace-pre-wrap rounded-[var(--radius-control)] bg-muted/35 p-4 text-sm leading-6">{lightbox.text}</p>}<div className="flex flex-wrap gap-2">{lightbox.fileUrl && <a href={lightbox.fileUrl} download className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:border-border-hover"><Download className="size-4" aria-hidden="true" />{t("testimonials.download")}</a>}{lightbox.text && <Button type="button" variant="outline" onClick={() => copyText(lightbox)}><Clipboard className="size-4" aria-hidden="true" />{t("testimonials.copy")}</Button>}</div></div>}</DialogContent></Dialog></div>;
}
