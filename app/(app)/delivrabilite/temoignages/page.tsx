import { getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { getJourneyOptions, getTestimonials } from "@/lib/deliverability/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { TestimonialsGallery } from "./testimonials-gallery";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function TestimonialsPage({ searchParams }: { searchParams?: SearchParams }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "delivrabilite:temoignages");
  const params = searchParams ? await searchParams : {};
  const [data, options, t] = await Promise.all([getTestimonials(accountId), getJourneyOptions(accountId), getTranslations("deliverability")]);
  const chatContext: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "delivrabilite_temoignages" };
  const prefill = {
    journeyId: firstParam(params.journeyId),
    clientName: firstParam(params.clientName),
    offerId: firstParam(params.offerId),
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">{t("title")}</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{t("testimonials.title")}</h1>
        <p className="max-w-2xl text-base text-muted-foreground">{t("testimonials.subtitle")}</p>
      </header>
      <AgentBanner stateText={t("tracking.agentState")} ctaLabel={t("tracking.agentCta")} chatContext={chatContext} />
      <TestimonialsGallery initialData={data} journeys={options.journeys} offers={options.offers} prefill={prefill} />
    </div>
  );
}
