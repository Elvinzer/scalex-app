import { notFound } from "next/navigation";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";

import { toggleLeverStep, activateLever } from "./actions";
import { DemarrerInteractive } from "./demarrer-interactive";
import { LeverVideoGrid } from "./lever-video-grid";
import { Falco } from "@/components/falco/falco";
import { AGENT_KEY_CONSOLIDATION } from "@/lib/agent/agent-consolidation";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { AGENT_KEY_TO_SKIN } from "@/lib/falco-skins";
import { getLeversCatalog, resolveFromBusinessProfile } from "@/lib/levers/catalog";
import { buildPersonalizedBlurb } from "@/lib/levers/demarrer-context";
import { localizeGuideEntry, localizeStarterPlan } from "@/lib/levers/guide-locale";
import { localizeLeverLabel } from "@/lib/levers/locale";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getLeverVideos } from "@/lib/levers/resources";
import { getStarterPlan, getStarterProgress } from "@/lib/levers/starter-plan";
import { getLeverStatus } from "@/lib/levers/status";
import { requirePermissionOrRedirect } from "@/lib/team/context";

const EFFORT_CLASS: Record<"faible" | "moyen" | "eleve", string> = {
  faible: "bg-state-healthy-bg text-state-healthy",
  moyen: "bg-state-caution-bg text-state-caution",
  eleve: "bg-state-critical-bg text-state-critical",
};

function skinForLever(leverKey: string) {
  const consolidatedKey = AGENT_KEY_CONSOLIDATION[leverKey] ?? leverKey;
  return AGENT_KEY_TO_SKIN[consolidatedKey] ?? null;
}

export default async function DemarrerLeverPage({ params }: { params: Promise<{ leverKey: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("app.leverGuide");
  const tDiagnostic = await getTranslations("diagnostic");
  const { leverKey } = await params;
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");

  const catalog = await getLeversCatalog();
  const entry = catalog.find((lever) => lever.leverKey === leverKey);
  if (!entry) notFound();
  const localizedEntry = {
    ...localizeGuideEntry(entry, locale),
    label: localizeLeverLabel(entry.leverKey, entry.label, locale, tDiagnostic),
  };

  after(() => track("lever_guide_opened", userId, { lever_key: leverKey }));

  const [businessProfile, impact, plan, progress, videos, leverStatus] = await Promise.all([
    getBusinessProfile(accountId),
    getLeverImpactEstimate(accountId, leverKey),
    getStarterPlan(leverKey),
    getStarterProgress(accountId, leverKey),
    getLeverVideos(leverKey),
    entry.readsFromProfile ? Promise.resolve(null) : getLeverStatus(accountId, leverKey),
  ]);
  const localizedPlan = localizeStarterPlan(plan, leverKey, locale);

  const status = entry.readsFromProfile ? (resolveFromBusinessProfile(leverKey, businessProfile) ?? "not_answered") : leverStatus!.status;
  const hasRealStats = !entry.readsFromProfile && Object.keys(leverStatus!.stats).length > 0;
  const canActivate = Boolean(
    (localizedPlan && localizedPlan.length > 0 && localizedPlan.every((step) => progress.includes(step.order))) || hasRealStats
  );

  const falcoSkin = skinForLever(leverKey);
  const personalizedBlurb =
    impact && locale === "en" ? t("personalizedHelp") : impact ? buildPersonalizedBlurb(businessProfile, impact.explanation) : null;
  const localizedImpactWarning = impact?.warning ? (locale === "en" ? t("impactWarning") : impact.warning) : null;

  async function handleToggleStep(order: number) {
    "use server";
    await toggleLeverStep(leverKey, order);
  }

  async function handleActivate() {
    "use server";
    await activateLever(leverKey);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* En-tête */}
      <div className="sticker-spotlight flex flex-wrap items-center gap-6 px-7 py-6">
        {falcoSkin ? (
          <Falco skin={falcoSkin} portrait skinSizePx={64} priority className="rounded-full" />
        ) : (
          <Falco pose="neutral" size="md" />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-on-dark)]">{localizedEntry.label}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${EFFORT_CLASS[localizedEntry.effort]}`}>
              {t(`effort.${localizedEntry.effort}`)}
            </span>
            {localizedEntry.estTimeLabel && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-mist/80">
                ⏱ {localizedEntry.estTimeLabel}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-mist/70">
            {impact?.impactRangeEur
              ? t("impactRange", { min: formatEur(impact.impactRangeEur.min, locale), max: formatEur(impact.impactRangeEur.max, locale) })
              : impact?.amountEur !== null && impact?.amountEur !== undefined
                ? t("impactAmount", { amount: formatEur(impact.amountEur, locale) })
                : status === "active"
                  ? t("alreadyActive")
                  : t("startWithPlan")}
          </p>
          {localizedImpactWarning && <p className="mt-2 text-sm font-bold text-state-caution">{localizedImpactWarning}</p>}
        </div>
      </div>

      {/* Section 1 — C'est quoi, concrètement */}
      {localizedEntry.explanation && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{t("whatIsIt")}</h2>
          <div className="flex flex-col gap-2 text-sm text-foreground">
            {localizedEntry.explanation.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          {personalizedBlurb && (
            <div className="sticker-card-dashed p-4">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("forYou")}</p>
              <p className="mt-1 text-sm">{personalizedBlurb}</p>
            </div>
          )}
        </div>
      )}

      {/* Section 2 — Apprends en vidéo */}
      {videos.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{t("learnVideo")}</h2>
          <LeverVideoGrid leverKey={leverKey} videos={videos} />
        </div>
      )}

      {/* Sections 3 + 4 — plan d'action + chat Falco (client, état partagé) */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold">{t("actionPlan")}</h2>
        {!plan && (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">{t("noPlan")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noPlanHelp")}
            </p>
          </div>
        )}
        <DemarrerInteractive
          leverKey={leverKey}
          leverLabel={localizedEntry.label}
          falcoSkin={falcoSkin}
          plan={localizedPlan}
          initialProgress={progress}
          canActivate={canActivate}
          onToggleStep={handleToggleStep}
          onActivate={handleActivate}
        />
      </div>
    </div>
  );
}
