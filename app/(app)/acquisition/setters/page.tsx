import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { computeSettersCommissions, getSetters } from "@/lib/setters/queries";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { AddSetterDialog } from "./add-setter-dialog";
import { SetterCard } from "./setter-card";

export default async function SettersPage() {
  const t = await getTranslations("app.setters");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:setters");

  const context = await getAccountContext(userId);
  if (context?.isOwner) redirect("/settings/equipe");

  const [setters, businessProfile] = await Promise.all([getSetters(accountId), getBusinessProfile(accountId)]);
  const summaries = await computeSettersCommissions(accountId, setters, businessProfile.sales.offers);
  const chatContext: ChatContext = { topicType: "lever", topicKey: "ceo_vision", topicLabel: "Vision", sourcePage: "acquisition_setters" };
  const falcoSkin = resolveFalcoSkin("/ventes/setters");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={t("agentState")}
        ctaLabel={t("improve")}
        chatContext={chatContext}
        mode="optimiser"
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <AddSetterDialog />
      </div>

      {setters.length === 0 ? (
        <FalcoEmptyState title={t("emptyTitle")} showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">{t("emptyHelp")}</p>
        </FalcoEmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {setters.map((setter, index) => (
            <SetterCard key={setter.id} setter={setter} summary={summaries[index]} />
          ))}
        </div>
      )}
    </div>
  );
}
