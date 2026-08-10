import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { phoneHref, whatsappHref } from "@/lib/native-booking/phone-links";

function followUpMessage(name: string | null, eventType: string | null, t: (key: string, values?: Record<string, string>) => string): string {
  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const subject = eventType?.trim() ? eventType.trim() : t("callSubject");
  return t("followUp", { firstName: firstName ? ` ${firstName}` : "", subject });
}

export function CallContactActions({
  phone,
  name,
  eventType,
  compact = false,
  className,
}: {
  phone: string | null | undefined;
  name: string | null | undefined;
  eventType?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.contact");
  const call = phoneHref(phone);
  const whatsapp = whatsappHref(phone, followUpMessage(name ?? null, eventType ?? null, t));
  if (!call && !whatsapp) return null;

  const label = name?.trim() || t("prospect");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label={t("contact", { name: label })}>
      {call && (
        <a
          href={call}
          aria-label={t("callAria", { name: label })}
          title={t("callAria", { name: label })}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20",
            compact ? "min-h-11 min-w-11 px-2" : "min-h-11"
          )}
        >
          <Phone className="size-4" aria-hidden="true" />
          {!compact && t("call")}
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("whatsappAria", { name: label })}
          title={`${t("whatsapp")} · ${label}`}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-state-healthy-bg px-3 text-xs font-bold text-state-healthy transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20",
            compact ? "min-h-11 min-w-11 px-2" : "min-h-11"
          )}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {!compact && t("whatsapp")}
        </a>
      )}
    </div>
  );
}
