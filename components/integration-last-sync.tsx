"use client";

import { Clock3 } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

type Props = {
  syncedAt?: Date | null;
  lastUpdatedLabel: (dateTime: string) => string;
  refreshLabel: string;
  unavailableLabel: string;
  loadingLabel: string;
};

export function IntegrationLastSync({
  syncedAt,
  lastUpdatedLabel,
  refreshLabel,
  unavailableLabel,
  loadingLabel,
}: Props) {
  const locale = useLocale();
  const [localDateTime, setLocalDateTime] = useState<string | null>(null);

  useEffect(() => {
    if (!syncedAt) {
      setLocalDateTime(null);
      return;
    }

    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateTimeOptions: Intl.DateTimeFormatOptions = {
      dateStyle: "short",
      timeStyle: "short",
    };
    if (browserTimeZone) dateTimeOptions.timeZone = browserTimeZone;

    setLocalDateTime(new Intl.DateTimeFormat(locale, dateTimeOptions).format(new Date(syncedAt)));
  }, [locale, syncedAt]);

  return (
    <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-state-healthy">
      <div className="flex items-start gap-2">
        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="min-h-5 text-sm font-bold" aria-live="polite">
            {syncedAt && localDateTime ? (
              <time dateTime={new Date(syncedAt).toISOString()}>{lastUpdatedLabel(localDateTime)}</time>
            ) : syncedAt ? (
              <span role="status">{loadingLabel}</span>
            ) : (
              unavailableLabel
            )}
          </p>
          <p className="mt-1 text-xs font-normal">{refreshLabel}</p>
        </div>
      </div>
    </div>
  );
}
