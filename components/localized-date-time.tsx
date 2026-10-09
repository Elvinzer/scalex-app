"use client";

import { useSyncExternalStore } from "react";

function subscribeToBrowserTimeZone() {
  return () => undefined;
}

function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getServerTimeZone() {
  return null;
}

export function LocalizedDateTime({ value, locale }: { value: string; locale: string }) {
  const timeZone = useSyncExternalStore(subscribeToBrowserTimeZone, getBrowserTimeZone, getServerTimeZone);
  const formatted = timeZone
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))
    : null;

  return <time dateTime={value}>{formatted}</time>;
}
