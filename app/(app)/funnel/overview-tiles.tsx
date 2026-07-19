import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { formatPercent } from "@/lib/setting/funnel";

export function OverviewTiles({
  newSubscribers,
  responseRate,
  callsAttended,
  closingRate,
}: {
  newSubscribers: number;
  responseRate: number | null;
  callsAttended: number;
  closingRate: number | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/acquisition/setting"
        className="sticker-card flex items-center justify-between p-5 transition-colors hover:bg-muted/40"
      >
        <div>
          <p className="text-sm font-medium">Setting</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {newSubscribers} abonnés · {responseRate === null ? "—" : formatPercent(responseRate)} de réponse
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-signal">
          Voir le détail
          <ArrowRight className="size-4" />
        </span>
      </Link>

      <Link
        href="/ventes/closing"
        className="sticker-card flex items-center justify-between p-5 transition-colors hover:bg-muted/40"
      >
        <div>
          <p className="text-sm font-medium">Closing</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {callsAttended} appels pris · {closingRate === null ? "—" : formatPercent(closingRate)} de closing
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-signal">
          Voir le détail
          <ArrowRight className="size-4" />
        </span>
      </Link>
    </div>
  );
}
