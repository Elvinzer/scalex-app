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
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { resolveFromBusinessProfile } from "@/lib/levers/catalog";
import { scoreAgainstBenchmark } from "@/lib/scoring";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getStarterPlan, getStarterProgress } from "@/lib/levers/starter-plan";
import { getLeverStatus } from "@/lib/levers/status";
import { formatPercent } from "@/lib/setting/funnel";
import { getSales, getSalesForMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { cn } from "@/lib/utils";

import { activateUpsellLever, toggleUpsellStarterStep } from "./actions";
import { AddUpsellDialog } from "./add-upsell-dialog";

const LEVER_KEY = "upsell_ascension";
// Same 20% reference already shown on the aggregate take-rate tile below —
// reused per-offer rather than inventing a second number.
const UPSELL_TAKE_RATE_BENCHMARK = 0.2;
const TIER_CLASS: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "bg-state-critical-bg text-state-critical",
  ambre: "bg-state-caution-bg text-state-caution",
  vert: "bg-state-healthy-bg text-state-healthy",
};

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
          stateText="Tu n'as pas encore d'upsell en place - Falco peut t'aider à démarrer."
          ctaLabel="Améliorer →"
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          agentName={agent?.name}
          agentIconKey={agent?.falcoSkinIcon}
          falcoSkin={falcoSkin}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Upsell</h1>
            <p className="mt-1 text-muted-foreground">Proposer une offre complémentaire après la vente principale.</p>
          </div>
          <AddUpsellDialog currentSales={profile.sales} />
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

  // Per-offer breakdown — replaces the single aggregate take-rate with one
  // row per offer explicitly marked "isUpsell" in Mon business (linked via
  // sales.upsellOfferId), same period (monthSales) as the tiles above.
  const upsellOffers = profile.sales.offers.filter((offer) => offer.isUpsell);
  const upsellOfferStats = upsellOffers.map((offer) => {
    const offerSales = monthSales.filter((s) => s.upsellOfferId === offer.id);
    const takeRate = monthSales.length > 0 ? offerSales.length / monthSales.length : null;
    const revenue = offerSales.reduce((sum, s) => sum + (s.upsellAmount ?? 0), 0);
    const score = takeRate !== null && offerSales.length > 0 ? scoreAgainstBenchmark(takeRate, UPSELL_TAKE_RATE_BENCHMARK) : null;
    return { offer, takeRate, revenue, score };
  });

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

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Upsell</h1>
          <p className="mt-1 text-muted-foreground">Le suivi de tes offres complémentaires après la vente principale.</p>
        </div>
        <AddUpsellDialog currentSales={profile.sales} />
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

      <div>
        <h2 className="mb-3 text-base font-bold">Tes upsells</h2>
        {upsellOffers.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">Aucune offre marquée comme upsell pour l&apos;instant</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Marque tes offres upsell dans Mon business pour suivre leur performance ici, une par une.
            </p>
            <a href="/business" className="mt-3 inline-block text-sm font-bold text-accent-text hover:underline">
              Marque tes upsells dans Mon business →
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upsellOfferStats.map(({ offer, takeRate: offerTakeRate, revenue, score }) => (
              <div key={offer.id} className="sticker-card flex flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{offer.name || "Offre sans nom"}</p>
                  {score === null ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground whitespace-nowrap">
                      Pas encore de données
                    </span>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", TIER_CLASS[getHealthTier(score).tier])}>
                      Score {score}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Take-rate ce mois</p>
                    <p className="font-bold tabular-nums">{offerTakeRate === null ? "—" : formatPercent(offerTakeRate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CA généré</p>
                    <p className="font-bold tabular-nums">{formatEur(revenue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
