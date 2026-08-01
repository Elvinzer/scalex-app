import { AgentBanner } from "@/components/agent-banner";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { computeSetterCommissions, getSetters } from "@/lib/setters/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { AddSetterDialog } from "./add-setter-dialog";
import { SetterCard } from "./setter-card";

export default async function SettersPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:setters");

  const [setters, businessProfile] = await Promise.all([getSetters(accountId), getBusinessProfile(accountId)]);

  const summaries = await Promise.all(
    setters.map((setter) => computeSetterCommissions(accountId, setter.id, businessProfile.sales.offers))
  );

  const chatContext: ChatContext = { topicType: "lever", topicKey: "ceo_vision", topicLabel: "Vision", sourcePage: "acquisition_setters" };
  const falcoSkin = resolveFalcoSkin("/acquisition/setters");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText="Tes setters et leurs commissions, calculées depuis tes vraies ventes."
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode="optimiser"
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Setters</h1>
          <p className="mt-1 text-muted-foreground">Commissions payées et à venir, calculées depuis Suivi des ventes.</p>
        </div>
        <AddSetterDialog />
      </div>

      {setters.length === 0 ? (
        <FalcoEmptyState title="Aucun setter pour l'instant" showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">Ajoute ton premier setter pour suivre ses commissions.</p>
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
