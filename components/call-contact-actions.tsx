import { MessageCircle, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { phoneHref, whatsappHref } from "@/lib/native-booking/phone-links";

function followUpMessage(name: string | null, eventType: string | null): string {
  const firstName = name?.trim().split(/\s+/)[0] ?? "";
  const subject = eventType?.trim() ? `ton ${eventType.trim()}` : "notre appel";
  return `Bonjour${firstName ? ` ${firstName}` : ""}, je reviens vers toi au sujet de ${subject}.`;
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
  const call = phoneHref(phone);
  const whatsapp = whatsappHref(phone, followUpMessage(name ?? null, eventType ?? null));
  if (!call && !whatsapp) return null;

  const label = name?.trim() || "ce prospect";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label={`Contacter ${label}`}>
      {call && (
        <a
          href={call}
          aria-label={`Appeler ${label}`}
          title={`Appeler ${label}`}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20",
            compact ? "min-h-11 min-w-11 px-2" : "min-h-11"
          )}
        >
          <Phone className="size-4" aria-hidden="true" />
          {!compact && "Appeler"}
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Envoyer un message WhatsApp à ${label}`}
          title={`WhatsApp · ${label}`}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-state-healthy-bg px-3 text-xs font-bold text-state-healthy transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20",
            compact ? "min-h-11 min-w-11 px-2" : "min-h-11"
          )}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {!compact && "WhatsApp"}
        </a>
      )}
    </div>
  );
}
