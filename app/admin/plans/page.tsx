import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { formatUsdCents } from "@/lib/currency";

import { PlanActiveToggle } from "./plan-active-toggle";
import { PlanFormDialog } from "./plan-form-dialog";

export default async function AdminPlansPage() {
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.priceMonthlyCents);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Plans d&apos;abonnement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prix, fonctionnalités incluses et disponibilité — chaque changement de prix crée un
            nouveau Price Stripe (l&apos;ancien est archivé, jamais supprimé).
          </p>
        </div>
        <PlanFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" /> Nouveau plan
            </Button>
          }
        />
      </div>

      <div className="sticker-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-bold">Plan</th>
              <th className="px-4 py-3 font-bold">Clé</th>
              <th className="px-4 py-3 font-bold">Prix / mois</th>
              <th className="px-4 py-3 font-bold">Équipe</th>
              <th className="px-4 py-3 font-bold">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const features = plan.features as { teamMembersEnabled?: boolean; maxTeamMembers?: number | null };
              return (
                <tr key={plan.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-bold">{plan.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{plan.key}</td>
                  <td className="px-4 py-3 tabular-nums">{formatUsdCents(plan.priceMonthlyCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {features.teamMembersEnabled
                      ? `Incluse${features.maxTeamMembers ? ` (max ${features.maxTeamMembers})` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PlanActiveToggle id={plan.id} isActive={plan.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PlanFormDialog
                      plan={plan}
                      trigger={
                        <Button type="button" variant="outline" size="sm">
                          Modifier
                        </Button>
                      }
                    />
                  </td>
                </tr>
              );
            })}
            {plans.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun plan pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
