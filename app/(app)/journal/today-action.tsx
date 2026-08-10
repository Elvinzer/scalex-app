"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { FalcoPageGreet } from "@/components/falco/falco-page-greet";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

import { markTodayActionDone } from "./actions";

// Bloc 1 du brief — "Action du jour". The single dark block on the page, and
// the only place a filled coral button appears (the brief's rule: one
// primary action per screen). Everything shown comes from the diagnostic
// engine, never from free-form input: this page tells the user what to do,
// it isn't a task manager.
export type TodayAction = {
  metricKey: string;
  label: string;
  // Where the recommendation comes from — "Vient de ton goulot : Prise de RDV".
  originLabel: string;
  explanation: string;
  monthlyGainEur: number | null;
  chatContext: ChatContext;
};

export function TodayActionCard({ action }: { action: TodayAction }) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [chatOpen, setChatOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChatOpenChange(next: boolean) {
    setChatOpen(next);
    if (next) void recordImproveChatOpened(action.chatContext);
  }

  function handleDone() {
    startTransition(async () => {
      const result = await markTodayActionDone(action.metricKey, action.label);
      if (!result.error) setDone(true);
    });
  }

  return (
    <>
      <section className="sticker-spotlight animate-rise px-7 py-6" aria-labelledby="today-action-title">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold tracking-[0.08em] text-accent uppercase">{t("dailyAction")}</p>
          <span className="h-3 w-px bg-mist/25" aria-hidden="true" />
          <p className="text-xs text-mist/60">{action.originLabel}</p>
        </div>

        <div className="mt-4 flex items-start gap-4">
          <FalcoPageGreet pageKey="dashboard" pose="alert" size="sm" className="hidden shrink-0 sm:flex" />
          <div className="min-w-0">
            <p className="text-[13px] text-mist/70">{t("falcoProposes")}</p>
            <h2 id="today-action-title" className="mt-0.5 text-[22px] leading-snug font-bold text-text-on-dark">
              {action.label}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist/75">{action.explanation}</p>

            {action.monthlyGainEur !== null && (
              <p className="mt-3 inline-flex rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
                {t("estimatedImpact", { amount: formatEur(action.monthlyGainEur, locale) })}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {/* The one filled coral button on the whole screen. */}
              <Button size="lg" type="button" onClick={() => handleChatOpenChange(true)}>
                {t("doWithFalco")}
              </Button>
              <Button
                size="lg"
                type="button"
                variant="outline"
                disabled={isPending || done}
                onClick={handleDone}
                className="border-mist/25 bg-transparent text-text-on-dark hover:bg-mist/10 hover:text-text-on-dark"
              >
                {done ? (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    {t("noted")}
                  </>
                ) : (
                  t("done")
                )}
              </Button>
            </div>
            {done && <p className="mt-2 text-xs text-mist/60">{t("addedToJournal")}</p>}
          </div>
        </div>
      </section>

      <Drawer open={chatOpen} onOpenChange={handleChatOpenChange}>
        <DrawerContent>
          <LazyImproveChat context={action.chatContext} period="3-months" gapBadge={null} />
        </DrawerContent>
      </Drawer>
    </>
  );
}
