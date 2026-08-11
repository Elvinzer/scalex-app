"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, CheckCircle2, ExternalLink, Pencil, Plus, RefreshCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CalendarSettingsView } from "@/lib/native-booking/settings";

import {
  disconnectNativeBookingCalendarAction,
  saveNativeBookingCalendarSettingsAction,
} from "./actions";

type EditableSection = "invitation" | "conflicts" | null;

export function CalendarSettings({ initial, notice }: { initial: CalendarSettingsView; notice: { tone: "success" | "error"; text: string } | null }) {
  const t = useTranslations("app.booking.calendarSettings");
  const tBooking = useTranslations("app.booking");
  const [isPending, startTransition] = useTransition();
  const [invitationConnectionId, setInvitationConnectionId] = useState(initial.invitationConnectionId ?? "");
  const [conflicts, setConflicts] = useState<Set<string>>(() => new Set(initial.conflicts));
  const [editingSection, setEditingSection] = useState<EditableSection>(null);
  const [invitationDraft, setInvitationDraft] = useState("");
  const [conflictDraft, setConflictDraft] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleConnections = useMemo(
    () => initial.connections.filter((connection) => connection.provider === "google"),
    [initial.connections]
  );
  const activeGoogleConnections = useMemo(
    () => googleConnections.filter((connection) => connection.status === "connected"),
    [googleConnections]
  );
  const selectedInvitationConnection = googleConnections.find((connection) => connection.id === invitationConnectionId) ?? null;
  const selectedConflictConnections = googleConnections.filter((connection) => conflicts.has(connection.id));
  const targetReady = Boolean(
    selectedInvitationConnection?.status === "connected" &&
      selectedInvitationConnection.primaryCalendar?.canWrite
  );
  const currentConfigurationReady = Boolean(
    targetReady &&
      conflicts.size > 0 &&
      selectedConflictConnections.length === conflicts.size &&
      selectedConflictConnections.every((connection) => connection.status === "connected" && connection.primaryCalendar)
  );

  function showError(code: string | null) {
    setMessage(null);
    setError(code ? t(`errors.${code}`) : null);
  }

  function saveSettings(targetId: string | null, conflictIds: string[], onSuccess: () => void) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveNativeBookingCalendarSettingsAction({
        invitationConnectionId: targetId,
        conflictConnectionIds: conflictIds,
      });
      if (result.error) {
        showError(result.error);
        return;
      }
      onSuccess();
      setMessage(t("saved"));
    });
  }

  function startInvitationEdit() {
    setError(null);
    setInvitationDraft(invitationConnectionId);
    setEditingSection("invitation");
  }

  function startConflictEdit() {
    setError(null);
    setConflictDraft(new Set(conflicts));
    setEditingSection("conflicts");
  }

  function cancelEdit() {
    setError(null);
    setEditingSection(null);
  }

  function saveInvitation() {
    saveSettings(invitationDraft || null, Array.from(conflicts), () => {
      setInvitationConnectionId(invitationDraft);
      setEditingSection(null);
    });
  }

  function saveConflicts() {
    saveSettings(invitationConnectionId || null, Array.from(conflictDraft), () => {
      setConflicts(new Set(conflictDraft));
      setEditingSection(null);
    });
  }

  function toggleConflict(connectionId: string) {
    setConflictDraft((current) => {
      const next = new Set(current);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      return next;
    });
  }

  function disconnect(connectionId: string) {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await disconnectNativeBookingCalendarAction({ connectionId });
      if (result.error) showError(result.error);
      else window.location.reload();
    });
  }

  const canStartInvitationEdit = editingSection === null;
  const canStartConflictEdit = editingSection === null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent-text">{tBooking("calendarProviders.google")}</p>
          <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventes/rdv">{t("backToBooking")}</Link>
        </Button>
      </div>

      {notice && (
        <div className={`rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold ${notice.tone === "success" ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : "border-state-critical/30 bg-state-critical-bg text-state-critical"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {(error || message) && (
        <div className={`rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold ${error ? "border-state-critical/30 bg-state-critical-bg text-state-critical" : "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"}`} role={error ? "alert" : "status"} aria-live="polite">
          {error ?? message}
        </div>
      )}

      <section className="sticker-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-bold">{t("connectedCalendars")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("connectAnotherHelp")}</p>
          </div>
          <Button asChild variant="outline">
            <a href="/api/native-calendar/google/connect?returnTo=/settings/calendars">
              <Plus className="size-4" /> {t("addCalendar")}
            </a>
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-5 sm:p-6">
          {googleConnections.length === 0 && (
            <div className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 p-4 text-sm" role="status">
              <p className="font-bold">{t("connectFirst")}</p>
              <a className="mt-2 inline-flex items-center gap-1 font-bold text-accent-text underline" href="/api/native-calendar/google/connect?returnTo=/settings/calendars">
                {t("addCalendar")} <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}

          {googleConnections.map((connection) => (
            <div key={connection.id} className="rounded-[var(--radius-control)] border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-full bg-muted p-2" aria-hidden="true">
                    <CalendarDays className="size-5 text-accent-text" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{tBooking("calendarProviders.google")}</p>
                    <p className="truncate text-sm text-muted-foreground">{connection.email ?? t("googleAccount")}</p>
                    <p className={`mt-1 text-xs font-bold ${connection.status === "connected" ? "text-state-healthy" : "text-state-caution"}`}>
                      {connection.status === "connected" ? t("connected") : connection.status === "revoked" ? t("revoked") : t("reconnectRequired")}
                    </p>
                    {connection.status === "connected" && connection.loadError && (
                      <p className="mt-1 text-xs font-bold text-state-caution">{t("calendarLoadError")}</p>
                    )}
                    {connection.status === "connected" && !connection.loadError && !connection.primaryCalendar && (
                      <p className="mt-1 text-xs font-bold text-state-caution">{t("primaryCalendarUnavailable")}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {connection.status !== "connected" && (
                    <Button asChild size="sm" variant="outline">
                      <a href="/api/native-calendar/google/connect?returnTo=/settings/calendars">
                        <RefreshCw className="size-3.5" /> {t("reconnect")}
                      </a>
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => disconnect(connection.id)}>
                    <Unplug className="size-3.5" /> {t("disconnect")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sticker-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <h2 className="text-xl font-bold">{t("invitationTitle")}</h2>
          <Button type="button" variant="outline" disabled={isPending || !canStartInvitationEdit} onClick={startInvitationEdit}>
            <Pencil className="size-4" /> {t("edit")}
          </Button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="max-w-3xl text-sm text-muted-foreground">{t("invitationHelp")}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${currentConfigurationReady ? "bg-state-healthy-bg text-state-healthy" : "bg-state-caution/10 text-state-caution"}`}>
              {currentConfigurationReady && <CheckCircle2 className="size-3.5" />}
              {currentConfigurationReady ? t("ready") : t("notReady")}
            </span>
          </div>
          {editingSection === "invitation" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-bold">{t("chooseAccount")}</p>
              {activeGoogleConnections.length === 0 ? (
                <p className="rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("connectFirst")}</p>
              ) : (
                <fieldset className="grid gap-3" aria-label={t("chooseAccount")}>
                  {activeGoogleConnections.map((connection) => (
                    <label key={connection.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-border px-4 py-3 has-[:checked]:border-accent-text has-[:checked]:bg-muted">
                      <input
                        type="radio"
                        name="invitation-account"
                        value={connection.id}
                        checked={invitationDraft === connection.id}
                        onChange={() => setInvitationDraft(connection.id)}
                        disabled={isPending}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{connection.email ?? t("googleAccount")}</span>
                        {!connection.primaryCalendar && <span className="block truncate text-xs text-state-caution">{connection.loadError ? t("calendarLoadError") : t("primaryCalendarUnavailable")}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" disabled={isPending} onClick={cancelEdit}>{t("cancel")}</Button>
                <Button type="button" disabled={isPending} onClick={saveInvitation}>{isPending ? t("saving") : t("save")}</Button>
              </div>
            </div>
          ) : selectedInvitationConnection ? (
            <div className="flex min-h-16 items-center gap-3 rounded-[var(--radius-control)] border border-border px-4 py-3">
              <CalendarDays className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{selectedInvitationConnection.email ?? t("googleAccount")}</span>
                {!selectedInvitationConnection.primaryCalendar && <span className="block truncate text-xs text-state-caution">{selectedInvitationConnection.loadError ? t("calendarLoadError") : t("primaryCalendarUnavailable")}</span>}
              </span>
            </div>
          ) : (
            <p className="rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("noInvitationAccount")}</p>
          )}

          {selectedInvitationConnection && !targetReady && (
            <p className="mt-3 text-sm font-bold text-state-caution">
              {selectedInvitationConnection.loadError ? t("calendarLoadError") : t("noWritablePrimaryCalendar")}
            </p>
          )}
        </div>
      </section>

      <section className="sticker-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <h2 className="text-xl font-bold">{t("conflictsTitle")}</h2>
          <Button type="button" variant="outline" disabled={isPending || !canStartConflictEdit} onClick={startConflictEdit}>
            <Pencil className="size-4" /> {t("edit")}
          </Button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="max-w-3xl text-sm text-muted-foreground">{t("conflictsHelp")}</p>
          {editingSection === "conflicts" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-bold">{t("selectConflictAccounts")}</p>
              {googleConnections.length === 0 ? (
                <p className="rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("connectFirst")}</p>
              ) : (
                <div className="grid gap-3">
                  {googleConnections.map((connection) => (
                    <label key={connection.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-border px-4 py-3 has-[:checked]:border-accent-text has-[:checked]:bg-muted">
                      <input
                        type="checkbox"
                        checked={conflictDraft.has(connection.id)}
                        onChange={() => toggleConflict(connection.id)}
                        disabled={isPending}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{connection.email ?? t("googleAccount")}</span>
                        {connection.status !== "connected" && <span className="block truncate text-xs text-state-caution">{t("reconnectRequired")}</span>}
                        {connection.status === "connected" && !connection.primaryCalendar && <span className="block truncate text-xs text-state-caution">{connection.loadError ? t("calendarLoadError") : t("primaryCalendarUnavailable")}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" disabled={isPending} onClick={cancelEdit}>{t("cancel")}</Button>
                <Button type="button" disabled={isPending} onClick={saveConflicts}>{isPending ? t("saving") : t("save")}</Button>
              </div>
            </div>
          ) : selectedConflictConnections.length > 0 ? (
            <div className="flex flex-col gap-3">
              {selectedConflictConnections.map((connection) => (
                <div key={connection.id} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border border-border px-4 py-3">
                  <CalendarDays className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{connection.email ?? t("googleAccount")}</span>
                    {connection.status !== "connected" && <span className="block truncate text-xs text-state-caution">{t("reconnectRequired")}</span>}
                    {connection.status === "connected" && !connection.primaryCalendar && <span className="block truncate text-xs text-state-caution">{connection.loadError ? t("calendarLoadError") : t("primaryCalendarUnavailable")}</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[var(--radius-control)] bg-muted p-4 text-sm text-muted-foreground">{t("noConflictAccounts")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
