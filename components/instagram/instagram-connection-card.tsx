"use client";

import { Camera, Check, ChevronDown, ExternalLink, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { disconnectInstagram, refreshInstagramPosts } from "@/app/(app)/integrations/instagram-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const WHAT_WE_FETCH = [
  "fetchReach",
  "fetchEngagement",
  "fetchViews",
  "fetchProfile",
  "fetchStories",
];

const WHAT_WE_NEVER_FETCH = ["neverOutboundClicks"];

type Props = {
  connected: boolean;
  username?: string | null;
  initialSyncStatus?: string | null;
  initialSyncCompletedAt?: Date | null;
  subscriptionActive?: boolean;
  primaryCta?: boolean;
};

export function InstagramConnectionCard({
  connected,
  username,
  initialSyncStatus,
  initialSyncCompletedAt,
  subscriptionActive = true,
  primaryCta = false,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("integrations.instagram");
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await disconnectInstagram();
      if (result.error) setError(result.error);
    });
  }

  function handleRefresh() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await refreshInstagramPosts();
      if (result.error) {
        setError(result.error);
        return;
      }
      // A large never-synced backlog can take longer than one click's time
      // budget (see lib/instagram/protocol.ts's
      // INSTAGRAM_BACKFILL_TIME_BUDGET_MS) — the rest keeps going in the
      // background instead of leaving the user staring at a spinner.
      if (result.completed === false) {
        setNotice(t("backgroundSync"));
      }
    });
  }

  return (
    <div className="sticker-card p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Camera className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-bold">Instagram</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected && username
                ? t("connectedAs", { username })
                : t("description")}
            </p>
          </div>
        </div>
        {connected && (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-state-healthy-bg px-3 py-1 text-sm font-bold whitespace-nowrap text-state-healthy">
            <span className="size-2 rounded-full bg-state-healthy" />
            {t("connected")}
          </span>
        )}
      </div>

      {connected ? (
        <>
          {initialSyncStatus === "pending" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm text-state-healthy">
              <span className="font-bold">✅ {t("connected")}</span> {t("syncPending")}
            </div>
          )}
          {initialSyncStatus === "completed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy">
              {t("postsSynced")}
              {initialSyncCompletedAt &&
                ` ${t("onDate")} ${new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(initialSyncCompletedAt))}`}
              . {t("autoRefresh")}
            </div>
          )}
          {initialSyncStatus === "no_api_access" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
              <span className="font-bold">{t("notProfessionalTitle")}</span> {t("notProfessionalHelp")}
            </div>
          )}
          {initialSyncStatus === "token_expired" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
              {t("tokenExpired")}
            </div>
          )}
          {initialSyncStatus === "failed" && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm font-bold text-state-critical">
              {t("syncFailed")}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
              {isPending ? t("refreshing") : t("refreshNow")}
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
              {isPending ? t("disconnecting") : t("disconnect")}
            </Button>
          </div>
        </>
      ) : subscriptionActive ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="mt-4" variant={primaryCta ? "default" : "outline"}>
              {t("connect")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogTitle>{t("connect")}</DialogTitle>

            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2.5 text-sm text-state-caution">
                <span className="font-bold">{t("professionalRequirement")}</span> {t("professionalHelp")}
              </div>

              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="flex items-center justify-between gap-2 text-left text-sm font-bold text-muted-foreground hover:text-foreground"
              >
                {t("professionalGuide")}
                <ChevronDown className={`size-4 shrink-0 transition-transform ${guideOpen ? "rotate-180" : ""}`} />
              </button>
              {guideOpen && (
                <ol className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-muted p-3">
                  <GuideStep n={1}>{t("guide1")}</GuideStep>
                  <GuideStep n={2}>
                    {t("guide2")}
                  </GuideStep>
                  <GuideStep n={3}>
                    {t("guide3")}
                  </GuideStep>
                  <GuideStep n={4}>{t("guide4")}</GuideStep>
                </ol>
              )}

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">{t("whatFetch")}</p>
                <ul className="flex flex-col gap-1.5">
                  {WHAT_WE_FETCH.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-state-healthy" />
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">{t("whatNeverFetch")}</p>
                <ul className="flex flex-col gap-1.5">
                  {WHAT_WE_NEVER_FETCH.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                🔒 {t("securityNote")}
              </p>

              {error && <p className="text-sm text-state-critical">{error}</p>}

              <Button asChild className="justify-center">
                <a href="/api/instagram/connect">
                  {t("connectMyAccount")}
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm font-bold text-state-caution">
          {t("subscriptionRequired")}
        </div>
      )}

      {connected && error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
      {connected && !error && notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    </div>
  );
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
        {n}
      </span>
      <div className="text-sm">{children}</div>
    </li>
  );
}
