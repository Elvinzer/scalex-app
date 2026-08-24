"use client";

import { BarChart3, CalendarDays, Camera, CreditCard, MonitorPlay, PhoneCall, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { disconnectCalendly } from "@/app/(app)/integrations/calendly-actions";
import { disconnectIclosed } from "@/app/(app)/integrations/iclosed-actions";
import { disconnectInstagram, refreshInstagramPosts } from "@/app/(app)/integrations/instagram-actions";
import { disconnectMetaAds, refreshMetaAdAccounts } from "@/app/(app)/integrations/meta-ads-actions";
import { disconnectStripe } from "@/app/(app)/settings/actions";
import { disconnectYoutube, refreshYoutubeVideos } from "@/app/(app)/integrations/youtube-actions";
import { requestStripeInsightsRefresh } from "@/app/(app)/ventes/suivi/insight-actions";
import { Button } from "@/components/ui/button";

type RefreshKind = "page" | "stripe" | "instagram" | "youtube" | "meta";
type DisconnectKind = "stripe" | "meta" | "instagram" | "youtube" | "calendly" | "iclosed";
type IntegrationIcon = typeof BarChart3;

const ICONS: Record<string, IntegrationIcon> = {
  stripe: CreditCard,
  meta: BarChart3,
  instagram: Camera,
  youtube: MonitorPlay,
  calendly: CalendarDays,
  iclosed: PhoneCall,
};

export function ConnectedIntegrationRow({
  id,
  name,
  detail,
  refreshKind,
  disconnectKind,
  connectedLabel,
  refreshLabel,
  refreshingLabel,
  refreshDoneLabel,
  disconnectLabel,
}: {
  id: string;
  name: string;
  detail?: string | null;
  refreshKind: RefreshKind;
  disconnectKind: DisconnectKind;
  connectedLabel: string;
  refreshLabel: string;
  refreshingLabel: string;
  refreshDoneLabel: (count?: number) => string;
  disconnectLabel: string;
}) {
  const router = useRouter();
  const tActions = useTranslations("common.actions");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const Icon = ICONS[id] ?? CreditCard;

  function handleRefresh() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (refreshKind === "page") {
        router.refresh();
        return;
      }

      if (refreshKind === "stripe") {
        const result = await requestStripeInsightsRefresh();
        if (result.error) {
          setError(result.error);
          return;
        }
        setNotice(refreshDoneLabel());
        router.refresh();
        return;
      }

      const result = refreshKind === "instagram"
        ? await refreshInstagramPosts()
        : refreshKind === "youtube"
          ? await refreshYoutubeVideos()
          : await refreshMetaAdAccounts();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(refreshDoneLabel(result.imported));
      router.refresh();
    });
  }

  function handleDisconnect() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = disconnectKind === "stripe"
        ? await disconnectStripe()
        : disconnectKind === "meta"
          ? await disconnectMetaAds()
          : disconnectKind === "instagram"
            ? await disconnectInstagram()
            : disconnectKind === "youtube"
              ? await disconnectYoutube()
              : disconnectKind === "calendly"
                ? await disconnectCalendly()
                : await disconnectIclosed();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5 sm:px-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleRefresh}
        disabled={isPending}
        aria-label={isPending ? refreshingLabel : refreshLabel}
        title={isPending ? refreshingLabel : refreshLabel}
        className="shrink-0"
      >
        <RefreshCw className={isPending ? "size-3.5 animate-spin motion-reduce:animate-none" : "size-3.5"} />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-state-healthy">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-state-healthy" />
          <span className="truncate">{detail ?? connectedLabel}</span>
        </p>
        {(error || notice) && <p className={`mt-1 truncate text-xs ${error ? "text-state-critical" : "text-muted-foreground"}`} role="status">{error ?? notice}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDisconnect}
          disabled={isPending}
          aria-label={isPending ? tActions("disconnecting") : disconnectLabel}
          title={isPending ? tActions("disconnecting") : disconnectLabel}
          className="text-muted-foreground hover:text-state-critical"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
