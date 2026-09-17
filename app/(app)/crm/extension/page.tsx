import { ArrowLeft, ArrowUpRight, CheckCircle2, Download, Info, Monitor, ShieldCheck, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { requireCrmAccess } from "@/lib/crm/access";
import { getCrmExtensionRelease } from "@/lib/crm/extension-release";

export default async function CrmExtensionPage() {
  const t = await getTranslations("crm");
  const { userId } = await getCurrentUser();
  const access = await requireCrmAccess(userId);
  if (!access) redirect("/dashboard");

  const release = getCrmExtensionRelease();
  const stepDefinitions = [
    { key: "browser", icon: Monitor, description: t("extension.onboarding.steps.browser.description") },
    {
      key: "install",
      icon: Download,
      description: release.distribution === "pilot_package"
        ? t("extension.onboarding.steps.install.pilot")
        : release.distribution === "web_store"
          ? t("extension.onboarding.steps.install.store")
          : t("extension.onboarding.notConfiguredDescription"),
    },
    { key: "connect", icon: UserRound, description: t("extension.onboarding.steps.connect.description") },
    { key: "verify", icon: CheckCircle2, description: t("extension.onboarding.steps.verify.description") },
  ] as const;

  const distributionCopy = release.distribution === "web_store"
    ? {
        label: t("extension.onboarding.storeLabel"),
        eyebrow: t("extension.onboarding.storeRecommended"),
        description: t("extension.onboarding.storeDescription"),
        action: t("extension.onboarding.installAction"),
      }
    : release.distribution === "pilot_package"
      ? {
          label: t("extension.onboarding.pilotLabel"),
          eyebrow: t("extension.onboarding.pilotRecommended"),
          description: t("extension.onboarding.pilotDescription"),
          action: t("extension.onboarding.downloadPilot"),
        }
      : {
          label: t("extension.onboarding.notConfiguredLabel"),
          eyebrow: t("extension.onboarding.notConfiguredLabel"),
          description: t("extension.onboarding.notConfiguredDescription"),
          action: null,
        };

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("extension.onboarding.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-bold">{t("extension.onboarding.title")}</h2>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t("extension.onboarding.description")}</p>
        </div>
        <Button asChild variant="outline" className="min-h-10">
          <Link href="/crm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("extension.onboarding.backToCrm")}
          </Link>
        </Button>
      </div>

      <section className="sticker-card flex flex-col gap-5 border-accent-border bg-accent-soft/35 p-5 sm:p-6" aria-labelledby="crm-extension-install-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-white" aria-hidden="true">
              <Download className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{distributionCopy.eyebrow}</p>
              <h2 id="crm-extension-install-title" className="mt-1 text-xl font-bold">{distributionCopy.label}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{distributionCopy.description}</p>
            </div>
          </div>
          <p className="shrink-0 text-sm font-bold text-muted-foreground" role="status" aria-live="polite">
            {t("extension.onboarding.latestVersion", { version: release.latestVersion })}
          </p>
        </div>

        {release.updateUrl && distributionCopy.action ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild className="min-h-11">
              <a href={release.updateUrl} target="_blank" rel="noopener noreferrer">
                {distributionCopy.action}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
            {release.distribution === "web_store" && release.packageUrl && (
              <Button asChild variant="outline" className="min-h-11">
                <a href={release.packageUrl} target="_blank" rel="noopener noreferrer">
                  <span>{t("extension.onboarding.latestPackage")}</span>
                  <Download className="size-4" aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border bg-card p-4" role="status">
            <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-bold text-muted-foreground">{distributionCopy.description}</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="crm-extension-steps-title">
        <div>
          <h2 id="crm-extension-steps-title" className="text-xl font-bold">{t("extension.onboarding.stepsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("extension.onboarding.stepsDescription")}</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {stepDefinitions.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.key} className="sticker-card flex min-w-0 gap-4 p-4 sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-accent-text" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("extension.onboarding.step", { number: index + 1 })}</p>
                  <h3 className="mt-1 font-bold">{t(`extension.onboarding.steps.${step.key}.title`)}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid gap-3 md:grid-cols-2" aria-label={t("extension.onboarding.permissionsTitle")}>
        <article className="sticker-card flex gap-3 p-4 sm:p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
          <div>
            <h2 className="font-bold">{t("extension.onboarding.permissionsTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("extension.onboarding.permissionsDescription")}</p>
          </div>
        </article>
        <article className="sticker-card flex gap-3 p-4 sm:p-5">
          <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-bold">{t("extension.onboarding.limitsTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("extension.onboarding.limitsDescription")}</p>
          </div>
        </article>
      </section>

      <section className="sticker-card p-5 sm:p-6" aria-labelledby="crm-extension-help-title">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="crm-extension-help-title" className="font-bold">{t("extension.onboarding.troubleshootingTitle")}</h2>
            <ul className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
              {(["notVisible", "notConnected", "crmUnavailable", "pilot"] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span><strong className="text-foreground">{t(`extension.onboarding.troubleshootingLabels.${key}`)}:</strong> {t(`extension.onboarding.troubleshooting.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
