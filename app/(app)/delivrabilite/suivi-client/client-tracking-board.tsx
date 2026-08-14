"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  GripVertical,
  MessageSquareText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { KpiTile } from "@/components/kpi-tile";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DeliveryBoardColumn, DeliveryBoardData, DeliveryClientCard, JourneyDetails } from "@/lib/deliverability/queries";
import type { ClientJourneyColumnType } from "@/lib/deliverability/types";

import {
  addJourneyColumn,
  addJourneyMilestone,
  addJourneyReminder,
  completeJourneyReminder,
  createJourney,
  createJourneyFromSale,
  deleteJourneyColumn,
  getJourneyDetailsAction,
  moveJourney,
  reorderJourneyColumns,
  saveJourneyNote,
  toggleJourneyMilestone,
  updateJourneyColumn,
} from "../actions";

const inputClass = "min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

function formatDate(value: string, locale: string, withTime = false) {
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

function formatPrice(value: number | null, locale: string) {
  return value === null ? null : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function SortableColumn({ column, children, onDropClient }: { column: DeliveryBoardColumn; children: React.ReactNode; onDropClient: (journeyId: string) => void }) {
  const t = useTranslations("deliverability");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop-${column.id}` });
  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const journeyId = event.dataTransfer.getData("application/x-minaly-journey");
        if (journeyId) onDropClient(journeyId);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-64 min-w-[250px] flex-1 flex-col rounded-[var(--radius-card)] border border-border bg-muted/30 p-3 lg:min-w-0 ${isDragging ? "opacity-60" : ""} ${isOver ? "border-accent bg-accent/5" : ""}`}
    >
      <div className="flex items-start gap-2 border-b border-border pb-3">
        <button type="button" aria-label={t("tracking.moveColumn", { name: column.name })} {...attributes} {...listeners} className="mt-0.5 flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent">
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{column.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{column.clients.length}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 pt-3">{children}</div>
    </section>
  );
}

function ClientCard({ client, onOpen }: { client: DeliveryClientCard; onOpen: (client: DeliveryClientCard) => void }) {
  const t = useTranslations("deliverability");
  const locale = useLocale();
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("application/x-minaly-journey", client.id)}
      onClick={() => onOpen(client)}
      className="group min-h-28 w-full rounded-[var(--radius-control)] border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-border-hover hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-bold">{client.clientName}</p>
        {client.inactive && <CircleAlert className="size-4 shrink-0 text-state-caution" aria-label={t("client.inactive")} />}
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{client.offerName ?? t("client.noSale")}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{formatDate(client.columnUpdatedAt, locale)}</span>
        {client.notesCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquareText className="size-3" aria-hidden="true" />{client.notesCount}</span>}
      </div>
    </button>
  );
}

function ColumnManager({ columns, onRefresh }: { columns: DeliveryBoardColumn[]; onRefresh: () => void }) {
  const t = useTranslations("deliverability");
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => columns.map((column) => ({ id: column.id, name: column.name, type: column.type })));
  const [newColumn, setNewColumn] = useState({ name: "", type: "progression" as ClientJourneyColumnType });
  const [deleteTarget, setDeleteTarget] = useState<Record<string, string>>({});
  useEffect(() => setDrafts(columns.map((column) => ({ id: column.id, name: column.name, type: column.type }))), [columns]);

  function saveColumn(draft: (typeof drafts)[number]) {
    startTransition(async () => {
      const result = await updateJourneyColumn(draft);
      if (result.error) return;
      onRefresh();
    });
  }

  function removeColumn(columnId: string) {
    const target = deleteTarget[columnId];
    if (!target) return;
    startTransition(async () => {
      const result = await deleteJourneyColumn(columnId, target);
      if (result.error) return;
      onRefresh();
    });
  }

  return (
    <div className="sticker-card p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{t("tracking.manageColumns")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("tracking.deleteColumnHelp")}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="grid gap-2 rounded-[var(--radius-control)] border border-border p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <input aria-label={t("tracking.columnNamePlaceholder")} value={draft.name} onChange={(event) => setDrafts((items) => items.map((item) => item.id === draft.id ? { ...item, name: event.target.value } : item))} className={inputClass} />
            <select aria-label={t("tracking.columnType")} value={draft.type} onChange={(event) => setDrafts((items) => items.map((item) => item.id === draft.id ? { ...item, type: event.target.value as ClientJourneyColumnType } : item))} className={inputClass}>
              {(Object.keys(t.raw("tracking.columnTypes")) as ClientJourneyColumnType[]).map((type) => <option key={type} value={type}>{t(`tracking.columnTypes.${type}`)}</option>)}
            </select>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => saveColumn(draft)}>{t("tracking.saveColumn")}</Button>
              <select aria-label={t("tracking.reassignTo")} value={deleteTarget[draft.id] ?? ""} onChange={(event) => setDeleteTarget((items) => ({ ...items, [draft.id]: event.target.value }))} className="min-h-11 max-w-28 rounded-[var(--radius-control)] border border-border bg-background px-2 text-xs">
                <option value="">{t("tracking.reassignTo")}</option>
                {columns.filter((column) => column.id !== draft.id).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
              <Button type="button" variant="destructive" size="icon" aria-label={t("tracking.deleteColumn")} disabled={isPending || columns.length <= 1 || !deleteTarget[draft.id]} onClick={() => removeColumn(draft.id)}><Trash2 className="size-4" aria-hidden="true" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input aria-label={t("tracking.columnNamePlaceholder")} placeholder={t("tracking.columnNamePlaceholder")} value={newColumn.name} onChange={(event) => setNewColumn((current) => ({ ...current, name: event.target.value }))} className={inputClass} />
        <select aria-label={t("tracking.columnType")} value={newColumn.type} onChange={(event) => setNewColumn((current) => ({ ...current, type: event.target.value as ClientJourneyColumnType }))} className={inputClass}>
          {(Object.keys(t.raw("tracking.columnTypes")) as ClientJourneyColumnType[]).map((type) => <option key={type} value={type}>{t(`tracking.columnTypes.${type}`)}</option>)}
        </select>
        <Button type="button" variant="outline" disabled={isPending || !newColumn.name.trim()} onClick={() => startTransition(async () => { const result = await addJourneyColumn(newColumn); if (!result.error) { setNewColumn({ name: "", type: "progression" }); onRefresh(); } })}><Plus className="size-4" aria-hidden="true" />{t("tracking.addColumn")}</Button>
      </div>
    </div>
  );
}

function ClientForm({ data, onClose, onSaved }: { data: DeliveryBoardData; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("deliverability");
  const [isPending, startTransition] = useTransition();
  const firstColumn = data.columns.find((column) => column.type === "entry") ?? data.columns[0];
  const [form, setForm] = useState({ clientName: "", saleId: "", offerId: "", columnId: firstColumn?.id ?? "", enteredAt: new Date().toISOString().slice(0, 10) });
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createJourney({ ...form, saleId: form.saleId || null, offerId: form.offerId || null });
      if (!result.error) { onSaved(); onClose(); }
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogTitle className="text-xl font-bold">{t("client.newTitle")}</DialogTitle>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t("client.name")}<input required value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} placeholder={t("client.namePlaceholder")} className={inputClass} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t("client.fromSale")}<select value={form.saleId} onChange={(event) => { const sale = data.untrackedSales.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, saleId: event.target.value, clientName: sale?.clientName ?? current.clientName, offerId: sale?.offerId ?? current.offerId })); }} className={inputClass}><option value="">{t("client.noSale")}</option>{data.untrackedSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.clientName} · {sale.totalPrice} €</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">{t("client.offer")}<select value={form.offerId} onChange={(event) => setForm((current) => ({ ...current, offerId: event.target.value }))} className={inputClass}><option value="">{t("client.chooseOffer")}</option>{data.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm font-bold">{t("client.column")}<select value={form.columnId} onChange={(event) => setForm((current) => ({ ...current, columnId: event.target.value }))} className={inputClass}>{data.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label className="flex flex-col gap-1.5 text-sm font-bold">{t("client.entryDate")}<input type="date" value={form.enteredAt} onChange={(event) => setForm((current) => ({ ...current, enteredAt: event.target.value }))} className={inputClass} /></label></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("client.cancel")}</Button><Button type="submit" disabled={isPending}>{t("client.save")}</Button></div>
    </form>
  );
}

function ClientDrawer({ client, open, onOpenChange }: { client: DeliveryClientCard | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("deliverability");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [details, setDetails] = useState<JourneyDetails | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const noteId = useRef<string | null>(null);
  const [milestoneName, setMilestoneName] = useState("");
  const [reminder, setReminder] = useState({ date: new Date().toISOString().slice(0, 16), note: "" });

  useEffect(() => {
    if (!open || !client) return;
    setDetails(null);
    setNoteDraft("");
    noteId.current = null;
    startTransition(async () => {
      const result = await getJourneyDetailsAction(client.id);
      if (result.details) setDetails(result.details);
    });
  }, [client, open]);

  useEffect(() => {
    if (!open || !details || noteDraft.trim() === "") return;
    const timer = window.setTimeout(() => {
      void saveJourneyNote(details.client.id, noteId.current, noteDraft).then((result) => { if (result.id) noteId.current = result.id; });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [details, noteDraft, open]);

  function refreshDetails() {
    if (!client) return;
    startTransition(async () => { const result = await getJourneyDetailsAction(client.id); if (result.details) setDetails(result.details); });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-[min(520px,calc(100vw-1rem))] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><DrawerTitle className="text-xl font-bold">{t("client.drawerTitle")}</DrawerTitle><DrawerClose asChild><Button type="button" variant="ghost" size="icon" aria-label={t("client.closeDrawer")}><X className="size-5" aria-hidden="true" /></Button></DrawerClose></div>
        {client && <div className="mt-5 flex flex-col gap-6">
          <div><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{client.clientName}</h2><p className="mt-1 text-sm text-muted-foreground">{client.offerName ?? t("client.noSale")}</p></div>{client.inactive && <span className="inline-flex items-center gap-1 rounded-full bg-state-caution/10 px-2 py-1 text-xs font-bold text-state-caution"><CircleAlert className="size-3" aria-hidden="true" />{t("client.inactive")}</span>}</div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-[var(--radius-control)] bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("client.entryDate")}</p><p className="mt-1 font-bold">{formatDate(client.enteredAt, locale)}</p></div><div className="rounded-[var(--radius-control)] bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("client.column")}</p><p className="mt-1 font-bold">{t(`tracking.columnTypes.${client.columnType}`)}</p></div></div></div>
          {details ? <>
            <section><h3 className="text-sm font-bold">{t("client.saleDetails")}</h3><div className="mt-2 grid grid-cols-2 gap-2 text-sm"><div className="rounded-[var(--radius-control)] bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("client.price")}</p><p className="mt-1 font-bold">{formatPrice(client.price, locale) ?? t("client.notProvided")}</p></div><div className="rounded-[var(--radius-control)] bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("client.closer")}</p><p className="mt-1 truncate font-bold">{details.sale?.closer ?? t("client.notProvided")}</p></div><div className="rounded-[var(--radius-control)] bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{t("client.setter")}</p><p className="mt-1 truncate font-bold">{details.setterName ?? t("client.notProvided")}</p></div></div></section>
            <section><h3 className="text-sm font-bold">{t("client.notes")}</h3><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder={t("client.notesPlaceholder")} rows={3} className={`${inputClass} mt-2 py-3`} />{details.notes.length > 0 ? <div className="mt-3 flex flex-col gap-2">{details.notes.map((note) => <div key={note.id} className="rounded-[var(--radius-control)] border border-border bg-muted/25 p-3"><p className="whitespace-pre-wrap text-sm">{note.body}</p><p className="mt-2 text-[11px] text-muted-foreground">{formatDate(note.updatedAt, locale, true)}</p></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{t("client.notesEmpty")}</p>}</section>
            <section><h3 className="text-sm font-bold">{t("client.milestones")}</h3><div className="mt-2 flex flex-col gap-2">{details.milestones.map((milestone) => <label key={milestone.id} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-sm"><input type="checkbox" checked={Boolean(milestone.completedAt)} onChange={() => startTransition(async () => { await toggleJourneyMilestone(milestone.id, !milestone.completedAt); refreshDetails(); })} /> <span className={milestone.completedAt ? "text-muted-foreground line-through" : "font-medium"}>{milestone.name}</span></label>)}</div><div className="mt-2 flex gap-2"><input value={milestoneName} onChange={(event) => setMilestoneName(event.target.value)} placeholder={t("client.milestonePlaceholder")} className={inputClass} /><Button type="button" variant="outline" size="icon" aria-label={t("client.addMilestone")} disabled={!milestoneName.trim() || isPending} onClick={() => startTransition(async () => { await addJourneyMilestone(client.id, milestoneName); setMilestoneName(""); refreshDetails(); })}><Plus className="size-4" aria-hidden="true" /></Button></div>{details.milestones.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("client.milestonesEmpty")}</p>}</section>
            <section><h3 className="text-sm font-bold">{t("client.reminders")}</h3><div className="mt-2 flex flex-col gap-2">{details.reminders.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border p-3 text-sm"><div><p className={item.completed ? "text-muted-foreground line-through" : "font-bold"}>{item.note}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.remindAt, locale, true)}</p></div><Button type="button" variant="outline" size="icon" aria-label={t("client.completeReminder")} onClick={() => startTransition(async () => { await completeJourneyReminder(item.id, !item.completed); refreshDetails(); })}>{item.completed ? <Check className="size-4" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}</Button></div>)}</div><div className="mt-2 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]"><input type="datetime-local" value={reminder.date} onChange={(event) => setReminder((current) => ({ ...current, date: event.target.value }))} className={inputClass} /><input value={reminder.note} onChange={(event) => setReminder((current) => ({ ...current, note: event.target.value }))} placeholder={t("client.reminderPlaceholder")} className={inputClass} /><Button type="button" variant="outline" disabled={!reminder.note.trim() || isPending} onClick={() => startTransition(async () => { await addJourneyReminder(client.id, reminder.date, reminder.note); setReminder((current) => ({ ...current, note: "" })); refreshDetails(); })}><Plus className="size-4" aria-hidden="true" /></Button></div>{details.reminders.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("client.remindersEmpty")}</p>}</section>
            <section><h3 className="text-sm font-bold">{t("client.history")}</h3><div className="mt-2 flex flex-col gap-2">{details.history.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 text-xs"><span>{entry.fromColumnName ? `${entry.fromColumnName} → ` : ""}{entry.toColumnName}</span><time className="text-muted-foreground">{formatDate(entry.changedAt, locale, true)}</time></div>)}</div>{details.history.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("client.historyEmpty")}</p>}</section>
            <Link href={`/delivrabilite/temoignages?journeyId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.clientName)}&offerId=${encodeURIComponent(client.offerId ?? "")}`} className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-bold hover:border-border-hover hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent">{t("client.requestTestimonial")}</Link>
          </> : <p className="text-sm text-muted-foreground">{isPending ? "…" : t("errors.generic")}</p>}
        </div>}
      </DrawerContent>
    </Drawer>
  );
}

export function ClientTrackingBoard({ initialData }: { initialData: DeliveryBoardData }) {
  const t = useTranslations("deliverability");
  const [data, setData] = useState(initialData);
  const [manageColumns, setManageColumns] = useState(false);
  const [clientForm, setClientForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<DeliveryClientCard | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  useEffect(() => setData(initialData), [initialData]);

  const refresh = () => window.location.reload();
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = data.columns.findIndex((column) => column.id === active.id);
    const newIndex = data.columns.findIndex((column) => column.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...data.columns];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setData((current) => ({ ...current, columns: next.map((column, index) => ({ ...column, position: index })) }));
    startTransition(async () => { await reorderJourneyColumns(next.map((column) => column.id)); refresh(); });
  }

  function handleDropClient(journeyId: string, columnId: string) {
    startTransition(async () => { const result = await moveJourney(journeyId, columnId); if (!result.error) refresh(); });
  }

  function statInfo(content: string) { return { ariaLabel: t("stats.calculation"), content }; }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label={t("stats.activeClients")} value={String(data.stats.activeClients)} detail={t("stats.activeClientsInfo")} info={statInfo(t("stats.activeClientsInfo"))} />
        <KpiTile label={t("stats.successRate")} value={percent(data.stats.successRate)} detail={data.stats.insufficientSample ? t("stats.insufficient") : t("stats.successRateInfo")} tone={data.stats.successRate === null ? "default" : "positive"} info={statInfo(t("stats.successRateInfo"))} />
        <KpiTile label={t("stats.dropoutRate")} value={percent(data.stats.dropoutRate)} detail={data.stats.insufficientSample ? t("stats.insufficient") : t("stats.dropoutRateInfo")} tone={data.stats.dropoutRate !== null && data.stats.dropoutRate > 0.2 ? "negative" : "default"} info={statInfo(t("stats.dropoutRateInfo"))} />
        <KpiTile label={t("stats.averageDuration")} value={data.stats.averageDurationDays === null ? "—" : t("stats.days", { count: Math.round(data.stats.averageDurationDays) })} detail={data.stats.insufficientSample ? t("stats.insufficient") : t("stats.averageDurationInfo")} info={statInfo(t("stats.averageDurationInfo"))} />
        <KpiTile label={t("stats.newcomers")} value={String(data.stats.newcomers)} detail={t("stats.newcomersInfo")} info={statInfo(t("stats.newcomersInfo"))} />
      </div>

      {data.untrackedSales.length > 0 && <section className="sticker-card border-accent/40 bg-accent/5 p-4 sm:p-5"><div className="flex flex-col gap-1"><h2 className="text-sm font-bold">{t("tracking.newSalesTitle")}</h2><p className="text-sm text-muted-foreground">{t("tracking.newSalesSubtitle")}</p></div><div className="mt-4 flex flex-col gap-2">{data.untrackedSales.map((sale) => <div key={sale.id} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{sale.clientName}</p><p className="mt-1 text-xs text-muted-foreground">{sale.offerName ?? t("client.noSale")} · {sale.totalPrice} € · {sale.saleDate}</p></div><Button type="button" variant="outline" disabled={isPending} onClick={() => startTransition(async () => { const result = await createJourneyFromSale(sale.id); if (!result.error) refresh(); })}>{t("tracking.addSale")}</Button></div>)}</div></section>}

      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">{t("tracking.title")}</p><p className="mt-1 text-xs text-muted-foreground">{t("tracking.clientCount", { count: data.stats.totalClients })}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setManageColumns((current) => !current)}><ChevronDown className={`size-4 transition-transform ${manageColumns ? "rotate-180" : ""}`} aria-hidden="true" />{manageColumns ? t("tracking.closeManageColumns") : t("tracking.manageColumns")}</Button><Button type="button" onClick={() => setClientForm(true)}><Plus className="size-4" aria-hidden="true" />{t("tracking.addClient")}</Button></div></div>
      {manageColumns && <ColumnManager columns={data.columns} onRefresh={refresh} />}

      <DndContext id="deliverability-board" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={data.columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">{data.columns.map((column) => <SortableColumn key={column.id} column={column} onDropClient={(journeyId) => handleDropClient(journeyId, column.id)}>{column.clients.map((client) => <ClientCard key={client.id} client={client} onOpen={setSelectedClient} />)}{column.clients.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("tracking.empty")}</p>}</SortableColumn>)}</div>
        </SortableContext>
      </DndContext>

      <Dialog open={clientForm} onOpenChange={setClientForm}><DialogContent><ClientForm data={data} onClose={() => setClientForm(false)} onSaved={refresh} /></DialogContent></Dialog>
      <ClientDrawer client={selectedClient} open={Boolean(selectedClient)} onOpenChange={(open) => { if (!open) setSelectedClient(null); }} />
    </div>
  );
}
