import { CalendarDays, Mail } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { CloserRow } from "@/lib/closers/types";

export async function CloserCard({ closer }: { closer: CloserRow }) {
  const t = await getTranslations("settings.team");
  const name = closer.isOwner ? t("you") : closer.name;
  const statusLabel = closer.status === "invited" ? t("invited") : closer.isOwner ? t("defaultCloser") : t("active");

  return (
    <article className="sticker-card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-sm font-bold text-accent-text">
          {name
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase())
            .slice(0, 2)
            .join("")}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            {closer.email}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {closer.status === "invited" ? t("closerInviteHelp") : t("closerAssignmentHelp")}
        </p>
        {closer.status !== "invited" && (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/settings/calendars">
              <CalendarDays className="size-3.5" />
              {t("manageCloserCalendar")}
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
