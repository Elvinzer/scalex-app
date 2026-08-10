import { Plus } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { KpiTile } from "@/components/kpi-tile";
import { LeverImpactEstimate } from "@/components/lever-impact-estimate";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { formatEur } from "@/lib/currency";
import { computeEmailCampaignMetrics } from "@/lib/email-campaigns/metrics";
import { getEmailCampaigns } from "@/lib/email-campaigns/queries";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getLeverStatus } from "@/lib/levers/status";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignsTable } from "./campaigns-table";
import { DiscoveryQuestion } from "./discovery-question";

const LEVER_KEY = "email_marketing";

export default async function MailPage() {
  const locale = await getLocale();
  const t = await getTranslations("app.mail");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:mail");

  const [campaigns, lever] = await Promise.all([
    getEmailCampaigns(accountId),
    getLeverStatus(accountId, LEVER_KEY),
  ]);

  const mode: "optimiser" | "demarrer" | "decouverte" =
    lever.status === "active" || campaigns.length > 0
      ? "optimiser"
      : lever.status === "not_answered"
        ? "decouverte"
        : "demarrer";

  after(() => track("lever_page_viewed", userId, { lever: LEVER_KEY, mode }));

  const chatContext: ChatContext = { topicType: "lever", topicKey: LEVER_KEY, topicLabel: t("topicLabel"), sourcePage: "acquisition_mail" };
  const falcoSkin = resolveFalcoSkin("/acquisition/mail");

  if (mode === "decouverte") {
    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
            stateText={t("discoveryState")}
            ctaLabel={t("improve")}
          chatContext={chatContext}
          mode={mode}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("notStartedSubtitle")}</p>
        </div>
        <DiscoveryQuestion />
      </div>
    );
  }

  if (mode === "demarrer") {
    const impact = await getLeverImpactEstimate(accountId, LEVER_KEY);

    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText={t("notStartedState")}
          ctaLabel={t("improve")}
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("notStartedSubtitle")}</p>
        </div>
        {impact && (
          <LeverImpactEstimate
            amountEur={impact.amountEur}
            rangeEur={impact.impactRangeEur}
            explanation={impact.explanation}
            warning={impact.warning}
            contextSentence={impact.contextSentence}
          />
        )}
        <Button variant="outline" asChild className="self-start">
          <Link href={`/demarrer/${LEVER_KEY}`} prefetch={true}>{t("fullGuide")} →</Link>
        </Button>
      </div>
    );
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthCampaigns = campaigns.filter((c) => c.sentAt.startsWith(currentMonth));
  const totalSends = monthCampaigns.reduce((sum, c) => sum + c.sends, 0);
  const openRates = monthCampaigns.map((c) => computeEmailCampaignMetrics(c).openRate).filter((v): v is number => v !== null);
  const avgOpenRate = openRates.length > 0 ? openRates.reduce((sum, v) => sum + v, 0) / openRates.length : null;
  const ctrValues = monthCampaigns.map((c) => computeEmailCampaignMetrics(c).ctr).filter((v): v is number => v !== null);
  const avgCtr = ctrValues.length > 0 ? ctrValues.reduce((sum, v) => sum + v, 0) / ctrValues.length : null;
  const totalRevenue = monthCampaigns.reduce((sum, c) => sum + (c.revenueAttributed ?? 0), 0);
  const totalBookings = monthCampaigns.reduce((sum, c) => sum + (c.bookings ?? 0), 0);
  const totalDealsClosed = monthCampaigns.reduce((sum, c) => sum + (c.dealsClosed ?? 0), 0);
  const listSize = typeof lever.stats.listSize === "number" ? lever.stats.listSize : null;

  const stateText =
    avgOpenRate !== null
      ? t("stateWithData", { rate: formatPercent(avgOpenRate, locale), revenue: formatEur(totalRevenue, locale) })
      : t("noSends");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel={t("improve")}
        chatContext={chatContext}
        mode={mode}
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <CampaignFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              {t("addSend")}
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {listSize !== null && (
          <KpiTile label={t("listSize")} value={listSize.toLocaleString(locale)} />
        )}
        <KpiTile label={t("sendsThisMonth")} value={totalSends.toLocaleString(locale)} />
        <KpiTile label={t("openRate")} value={avgOpenRate === null ? "—" : formatPercent(avgOpenRate, locale)} tone="positive" />
        <KpiTile label={t("clickRate")} value={avgCtr === null ? "—" : formatPercent(avgCtr, locale)} tone="accent2" />
        <KpiTile label={t("bookingsThisMonth")} value={totalBookings.toLocaleString(locale)} />
        <KpiTile label={t("dealsThisMonth")} value={totalDealsClosed.toLocaleString(locale)} tone="positive" />
      </div>

      <CampaignsTable campaigns={campaigns} falcoSkin={falcoSkin} />
    </div>
  );
}
