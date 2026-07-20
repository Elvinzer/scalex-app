import { desc, eq } from "drizzle-orm";

import { FunnelTabs } from "@/components/funnel-tabs";
import { db } from "@/db";
import { funnelStageInsights } from "@/db/schema";
import { STAGE_TITLES } from "@/lib/agent/knowledge";
import { getCurrentUser } from "@/lib/current-user";

import { ImplementedToggle } from "./implemented-toggle";

function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FunnelInsightsPage() {
  const { userId } = await getCurrentUser();

  const insights = await db
    .select()
    .from(funnelStageInsights)
    .where(eq(funnelStageInsights.userId, userId))
    .orderBy(desc(funnelStageInsights.generatedAt));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Insights</h1>
        <p className="mt-1 text-muted-foreground">
          Tout ce que l&apos;agent t&apos;a déjà suggéré sur ton funnel, et ce que tu as
          réellement mis en place.
        </p>
      </div>

      <FunnelTabs />

      {insights.length === 0 && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucun insight généré pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique sur « Insight » sur une métrique du funnel pour en générer un.
          </p>
        </div>
      )}

      {insights.length > 0 && (
        <div className="sticker-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-bold">Date</th>
                <th className="px-4 py-3 font-bold">Étape</th>
                <th className="px-4 py-3 font-bold">Insight</th>
                <th className="px-4 py-3 font-bold">Mis en place ?</th>
              </tr>
            </thead>
            <tbody>
              {insights.map((insight) => (
                <tr key={insight.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(insight.generatedAt)}
                  </td>
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                    {STAGE_TITLES[insight.stage]}
                  </td>
                  <td className="px-4 py-2.5">{insight.insightText}</td>
                  <td className="px-4 py-2.5">
                    <ImplementedToggle insightId={insight.id} implemented={insight.implemented} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
