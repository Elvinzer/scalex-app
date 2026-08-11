"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, CheckCircle2, ExternalLink, Plus, RefreshCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CalendarSettingsView } from "@/lib/native-booking/settings";

import {
  disconnectNativeBookingCalendarAction,
  saveNativeBookingCalendarSettingsAction,
} from "./actions";

function conflictKey(connectionId: string, calendarId: string) {
  return `${connectionId}:${calendarId}`;
}

export function CalendarSettings({ initial, notice }: { initial: CalendarSettingsView; notice: { tone: "success" | "error"; text: string } | null }) {
  const t = useTranslations("app.booking.calendarSettings");
  const [isPending, startTransition] = useTransition();
  const [invitationConnectionId, setInvitationConnectionId] = useState(initial.invitationConnectionId ?? "");
  const [invitationCalendarId, setInvitationCalendarId] = useState(initial.invitationCalendarId ?? "");
  const [conflicts, setConflicts] = useState<Set<string>>(
    () => new Set(initial.conflicts.map(({ connectionId, calendarId }) => conflictKey(connectionId, calendarId)))
  );
  const [isReady, setIsReady] = useState(initial.ready);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleConnections = useMemo(
    () => initial.connections.filter((connection) => connection.provider === "google"),
    [initial.connections]
  );
  const selectedConnection = googleConnections.find((connection) => connection.id === invitationConnectionId) ?? null;
  const writableCalendars = useMemo(
    () => selectedConnection?.calendars.filter((calendar) => calendar.canWrite) ?? [],
    [selectedConnection]
  );

  useEffect(() => {
    if (!selectedConnection || selectedConnection.status !== "connected") {
      const firstReadyConnection = googleConnections.find((connection) => connection.status === "connected" && connection.calendars.some((calendar) => calendar.canWrite));
      setInvitationConnectionId(firstReadyConnection?.id ?? "");
      setInvitationCalendarId(firstReadyConnection?.calendars.find((calendar) => calendar.canWrite)?.id ?? "");
      return;
    }
    if (!writableCalendars.some((calendar) => calendar.id === invitationCalendarId)) {
      setInvitationCalendarId(writableCalendars[0]?.id ?? "");
    }
  }, [googleConnections, invitationCalendarId, selectedConnection, writableCalendars]);

  function showError(code: string | null) {
    setMessage(null);
    setError(code ? t(`errors.${code}`) : null);
  }

  function save() {
    const selectedConflicts = Array.from(conflicts).map((value) => {
      const separator = value.indexOf(":");
      return { connectionId: value.slice(0, separator), calendarId: value.slice(separator + 1) };
    });
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveNativeBookingCalendarSettingsAction({
        invitationConnectionId,
        invitationCalendarId,
        conflicts: selectedConflicts,
      });
      if (result.error) showError(result.error);
      else {
        setIsReady(true);
        setMessage(t("saved"));
      }
    });
  }

  const currentConfigurationReady = Boolean(
    isReady &&
      selectedConnection?.status === "connected" &&
      invitationCalendarId &&
      writableCalendars.some((calendar) => calendar.id === invitationCalendarId) &&
      conflicts.size > 0
  );

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent">{t("providerName")}</p>
          <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventes/rdv">{t("backToBooking")}</Link>
        </Button>
      </div>

      {notice && <div className={`rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold ${notice.tone === "success" ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : "border-state-critical/30 bg-state-critical-bg text-state-critical"}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}

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
              <a className="mt-2 inline-flex items-center gap-1 font-bold text-accent underline" href="/api/native-calendar/google/connect?returnTo=/settings/calendars">
                {t("addCalendar")} <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
          {googleConnections.map((connection) => (
            <div key={connection.id} className="rounded-[var(--radius-control)] border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-full bg-muted p-2" aria-hidden="true"><CalendarDays className="size-5 text-accent" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{t("providerName")}</p>
                    <p className="truncate text-sm text-muted-foreground">{connection.email ?? t("googleAccount")}</p>
                    <p className={`mt-1 text-xs font-bold ${connection.status === "connected" ? "text-state-healthy" : "text-state-caution"}`}>
                      {connection.status === "connected" ? t("connected") : connection.status === "revoked" ? t("revoked") : t("reconnectRequired")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {connection.status !== "connected" && (
                    <Button asChild size="sm" variant="outline">
                      <a href="/api/native-calendar/google/connect?returnTo=/settings/calendars"><RefreshCw className="size-3.5" /> {t("reconnect")}</a>
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => disconnect(connection.id)}>
                    <Unplug className="size-3.5" /> {t("disconnect")}
                  </Button>
                </div>
              </div>
              {connection.loadError ? (
                <p className="mt-3 rounded-[var(--radius-control)] bg-state-caution/10 p-3 text-sm text-state-caution" role="status">{t("calendarLoadError")}</p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {connection.calendars.map((calendar) => (
                    <span key={calendar.id} className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">
                      {calendar.name}{calendar.isPrimary ? ` · ${t("primary")}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="sticker-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("invitationTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("invitationHelp")}</p>
          </div>
          {currentConfigurationReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-state-healthy-bg px-3 py-1.5 text-xs font-bold text-state-healthy"><CheckCircle2 className="size-3.5" /> {t("ready")}</span>
          ) : (
            <span className="rounded-full bg-state-caution/10 px-3 py-1.5 text-xs font-bold text-state-caution">{t("notReady")}</span>
          )}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("chooseAccount")}</span>
            <select value={invitationConnectionId} onChange={(event) => setInvitationConnectionId(event.target.value)} className="booking-admin-input" disabled={isPending || googleConnections.length === 0}>
              <option value="">{t("chooseAccount")}</option>
              {googleConnections.filter((connection) => connection.status === "connected").map((connection) => <option key={connection.id} value={connection.id}>{connection.email ?? connection.id}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("chooseCalendar")}</span>
            <select value={invitationCalendarId} onChange={(event) => setInvitationCalendarId(event.target.value)} className="booking-admin-input" disabled={isPending || writableCalendars.length === 0}>
              <option value="">{t("chooseCalendar")}</option>
              {writableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.isPrimary ? ` · ${t("primary")}` : ""}</option>)}
            </select>
          </label>
        </div>
        {selectedConnection && writableCalendars.length === 0 && <p className="mt-3 text-sm text-state-caution">{t("noWritableCalendar")}</p>}
      </section>

      <section className="sticker-card p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-bold">{t("conflictsTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("conflictsHelp")}</p>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          {googleConnections.length === 0 && <p className="rounded-[var(--radius-control)] bg-muted p-3 text-sm text-muted-foreground">{t("noConflictCalendars")}</p>}
          {googleConnections.map((connection) => (
            <div key={connection.id} className="rounded-[var(--radius-control)] border border-border p-4">
              <p className="font-bold">{connection.email ?? connection.id}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {connection.calendars.map((calendar) => {
                  const key = conflictKey(connection.id, calendar.id);
                  return (
                    <label key={calendar.id} className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] bg-muted/60 px-3 text-sm">
                      <input type="checkbox" checked={conflicts.has(key)} onChange={() => setConflicts((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })} disabled={isPending || connection.status !== "connected"} />
                      <span className="min-w-0 truncate">{calendar.name}{calendar.isPrimary ? ` · ${t("primary")}` : ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div className="min-h-5" aria-live="polite" role={error ? "alert" : "status"}>
            {error && <p className="text-sm font-bold text-state-critical">{error}</p>}
            {!error && message && <p className="text-sm font-bold text-state-healthy">{message}</p>}
          </div>
          <Button type="button" disabled={isPending || !invitationConnectionId || !invitationCalendarId || conflicts.size === 0} onClick={save}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </section>
    </div>
  );
}
