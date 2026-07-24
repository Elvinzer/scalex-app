import { after } from "next/server";

import { AgentBanner } from "@/components/agent-banner";
import { LeverImpactEstimate } from "@/components/lever-impact-estimate";
import { LeverStarterPlanCard } from "@/components/lever-starter-plan-card";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { formatEur } from "@/lib/currency";
import { todayUtc } from "@/lib/date-range";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { resolveFromBusinessProfile } from "@/lib/levers/catalog";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getStarterPlan, getStarterProgress } from "@/lib/levers/starter-plan";
import { getLeverStatus } from "@/lib/levers/status";
import { formatPercent } from "@/lib/setting/funnel";
import { getSales, getSalesForMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { activateUpsellLever, toggleUpsellStarterStep } from "./actions";

const LEVER_KEY = "upsell_ascension";

export default async function UpsellPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:upsell");

  const today = todayUtc();
  const [profile, leverRow, monthSales, agent] = await Promise.all([
    getBusinessProfile(accountId),
    getLeverStatus(accountId, LEVER_KEY),
    getSalesForMonth(accountId, today.getUTCFullYear(), today.getUTCMonth() + 1),
    getAgentByKey(LEVER_KEY),
  ]);

  const profileActive = resolveFromBusinessProfile(LEVER_KEY, profile) === "active";
  const isActive = profileActive || leverRow.status === "active" || monthSales.some((s) => s.hasUpsell);
  const mode: "optimiser" | "demarrer" = isActive ? "optimiser" : "demarrer";

  after(() => track("lever_page_viewed", userId, { lever: LEVER_KEY, mode }));

  const chatContext: ChatContext = { topicType: "lever", topicKey: LEVER_KEY, topicLabel: "Upsell", sourcePage: "ventes_upsell" };
  const falcoSkin = resolveFalcoSkin("/ventes/upsell");

  if (mode === "demarrer") {
    const [plan, progress, impact] = await Promise.all([
      getStarterPlan(LEVER_KEY),
      getStarterProgress(accountId, LEVER_KEY),
      getLeverImpactEstimate(accountId, LEVER_KEY),
    ]);
    const allDone = plan !== null && plan.length > 0 && plan.every((step) => progress.includes(step.order));

    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText="Tu n'as pas encore d'upsell en place — Falco peut t'aider à démarrer."
          ctaLabel="Améliorer →"
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          agentName={agent?.name}
          agentIconKey={agent?.falcoSkinIcon}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">Upsell</h1>
          <p className="mt-1 text-muted-foreground">Proposer une offre complémentaire après la vente principale.</p>
        </div>
        {impact && <LeverImpactEstimate amountEur={impact.amountEur} explanation={impact.explanation} />}
        {plan && (
          <LeverStarterPlanCard
            steps={plan}
            completedSteps={progress}
            canActivate={allDone}
            onToggleStep={async (order) => {
              "use server";
              await toggleUpsellStarterStep(order);
            }}
            onActivate={async () => {
              "use server";
              await activateUpsellLever();
            }}
          />
        )}
      </div>
    );
  }

  const allSales = await getSales(accountId);
  const upsellSales = allSales.filter((s) => s.hasUpsell);
  const takeRate = monthSales.length > 0 ? monthSales.filter((s) => s.hasUpsell).length / monthSales.length : null;
  const caUpsellMonth = monthSales.reduce((sum, s) => sum + (s.hasUpsell ? (s.upsellAmount ?? 0) : 0), 0);

  const withUpsellPrices = monthSales.filter((s) => s.hasUpsell).map((s) => s.totalPrice + (s.upsellAmount ?? 0));
  const withoutUpsellPrices = monthSales.filter((s) => !s.hasUpsell).map((s) => s.totalPrice);
  const avg = (values: number[]) => (values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
  const avgWithUpsell = avg(withUpsellPrices);
  const avgWithoutUpsell = avg(withoutUpsellPrices);

  const offerName = (offerId: string | null) => profile.sales.offers.find((o) => o.id === offerId)?.name ?? "—";

  const stateText =
    takeRate !== null
      ? `Take-rate de ${formatPercent(takeRate)} ce mois-ci (bench 20%), ${formatEur(caUpsellMonth)} de CA upsell.`
      : "Aucune vente ce mois-ci pour l'instant.";

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel="Améliorer →"
        chatContext={chatContext}
        mode={mode}
        agentName={agent?.name}
        agentIconKey={agent?.falcoSkinIcon}
        falcoSkin={falcoSkin}
      />

      <div>
        <h1 className="text-3xl font-bold">Upsell</h1>
        <p className="mt-1 text-muted-foreground">Le suivi de tes offres complémentaires après la vente principale.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Take-rate</p>
          <p className="mt-2 font-display text-3xl font-bold">{takeRate === null ? "—" : formatPercent(takeRate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Bench 20%</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CA upsell ce mois</p>
          <p className="mt-2 font-display text-3xl font-bold">{formatEur(caUpsellMonth)}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Panier moyen avec upsell</p>
          <p className="mt-2 font-display text-3xl font-bold">{avgWithUpsell === null ? "—" : formatEur(Math.round(avgWithUpsell))}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Panier moyen sans upsell</p>
          <p className="mt-2 font-display text-3xl font-bold">
            {avgWithoutUpsell === null ? "—" : formatEur(Math.round(avgWithoutUpsell))}
          </p>
        </div>
      </div>

      {upsellSales.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucun upsell enregistré pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Coche &quot;Upsell pris ?&quot; sur une vente dans Suivi des ventes pour le voir apparaître ici.
          </p>
        </div>
      ) : (
        <div className="sticker-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Offre upsell</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">Montant</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {upsellSales.slice(0, 10).map((sale) => (
                <tr key={sale.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{sale.clientName}</td>
                  <td className="p-3 text-muted-foreground">{offerName(sale.upsellOfferId)}</td>
                  <td className="p-3 text-right tabular-nums">{sale.upsellAmount === null ? "—" : formatEur(sale.upsellAmount)}</td>
                  <td className="p-3 text-muted-foreground">{sale.saleDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
