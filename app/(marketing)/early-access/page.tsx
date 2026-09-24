import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Search, Target, Users, Zap } from "lucide-react";

import { Falco } from "@/components/falco/falco";
import { getPublicSiteUrl, toJsonLd } from "@/lib/seo/site";

import { DashboardMockup } from "../dashboard-mockup";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";
import { EarlyAccessCta } from "./early-access-cta";
import { EarlyAccessForm } from "./early-access-form";

const PROBLEM_ITEMS = [
  { key: "acquisition", icon: Search },
  { key: "sales", icon: Target },
  { key: "content", icon: Zap },
] as const;

const PROCESS_ITEMS = [
  { key: "measure", number: "01", icon: Search },
  { key: "diagnose", number: "02", icon: Target },
  { key: "execute", number: "03", icon: Zap },
] as const;

const AUDIENCE_ITEMS = [
  { key: "coach", icon: Users },
  { key: "infobusiness", icon: Search },
  { key: "smallTeam", icon: Target },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("earlyAccess");
  const url = getPublicSiteUrl() + "/early-access";

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    alternates: { canonical: "/early-access" },
    openGraph: {
      title: t("metadata.title"),
      description: t("metadata.description"),
      url,
      siteName: "Minaly",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("metadata.title"),
      description: t("metadata.description"),
    },
    robots: { index: true, follow: true },
  };
}

export default async function EarlyAccessPage() {
  const t = await getTranslations("earlyAccess");
  const siteUrl = getPublicSiteUrl();
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: t("faq.accountQuestion"),
        acceptedAnswer: { "@type": "Answer", text: t("faq.accountAnswer") },
      },
      {
        "@type": "Question",
        name: t("faq.accessQuestion"),
        acceptedAnswer: { "@type": "Answer", text: t("faq.accessAnswer") },
      },
    ],
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Minaly",
    url: siteUrl,
    logo: siteUrl + "/icon.png",
  };

  return (
    <div className="bg-dot-grid bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }} />

      <SiteHeader variant="earlyAccess" />

      <main>
        <section className="px-6 pt-12 pb-16 sm:px-10 sm:pt-20 sm:pb-24">
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
            <div className="flex flex-col items-start gap-6 lg:col-start-1 lg:row-start-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent-text">
                {t("hero.eyebrow")}
              </span>

              <h1 className="max-w-xl text-[clamp(2.45rem,5vw,4.2rem)] leading-[1.04] font-bold tracking-tight text-foreground">
                {t("hero.title")} <span className="block text-accent-text">{t("hero.accent")}</span>
              </h1>

              <p className="max-w-xl text-[17px] leading-relaxed text-muted-foreground">{t("hero.description")}</p>
            </div>

            <div className="rounded-[24px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <EarlyAccessForm />
              <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{t("hero.formNote")}</p>
            </div>

            <div className="relative mt-2 w-full max-w-[560px] pt-4 pb-8 lg:col-start-1 lg:row-start-2">
              <DashboardMockup ariaLabel={t("hero.mockupAlt")} />
              <Falco
                variant="dashboard"
                size="lg"
                animate="enter"
                priority
                className="pointer-events-none absolute -bottom-5 -left-4 w-[92px] sm:-left-12 sm:w-[120px]"
              />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface-sunken px-6 py-16 sm:px-10 sm:py-20" aria-labelledby="early-access-problem-heading">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-2xl">
              <h2 id="early-access-problem-heading" className="text-[clamp(1.9rem,3.4vw,2.7rem)] leading-tight font-bold text-foreground">
                {t("problem.heading")}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{t("problem.intro")}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PROBLEM_ITEMS.map(({ key, icon: Icon }) => (
                <article key={key} className="rounded-[18px] border border-border bg-card p-6">
                  <div className="mb-5 flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent-text" aria-hidden="true">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{t("problem." + key + ".title")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("problem." + key + ".description")}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16 sm:px-10 sm:py-20" aria-labelledby="early-access-process-heading">
          <div className="mx-auto max-w-[1180px]">
            <div className="max-w-2xl">
              <h2 id="early-access-process-heading" className="text-[clamp(1.9rem,3.4vw,2.7rem)] leading-tight font-bold text-foreground">
                {t("process.heading")}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{t("process.intro")}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PROCESS_ITEMS.map(({ key, number, icon: Icon }) => (
                <article key={key} className="relative rounded-[18px] border border-border bg-card p-6">
                  <span className="text-xs font-bold tracking-[0.18em] text-accent-text">{number}</span>
                  <div className="mt-7 flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent-text" aria-hidden="true">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-foreground">{t("process." + key + ".title")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("process." + key + ".description")}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16 sm:px-10 sm:pb-20" aria-labelledby="early-access-audience-heading">
          <div className="mx-auto max-w-[1180px] rounded-[28px] px-6 py-12 sm:px-12 sm:py-16" style={{ background: "var(--gradient-dark)" }}>
            <div className="max-w-2xl">
              <h2 id="early-access-audience-heading" className="text-[clamp(1.9rem,3.4vw,2.7rem)] leading-tight font-bold text-white">
                {t("audience.heading")}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-mist/75">{t("audience.intro")}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {AUDIENCE_ITEMS.map(({ key, icon: Icon }) => (
                <article key={key} className="rounded-[18px] border border-white/10 bg-white/5 p-6">
                  <Icon className="size-5 text-accent" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-bold text-white">{t("audience." + key + ".title")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist/70">{t("audience." + key + ".description")}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16 sm:px-10 sm:py-20" aria-labelledby="early-access-faq-heading">
          <div className="mx-auto max-w-[900px]">
            <h2 id="early-access-faq-heading" className="text-[clamp(1.9rem,3.4vw,2.7rem)] leading-tight font-bold text-foreground">
              {t("faq.heading")}
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-[18px] border border-border bg-card p-6">
                <h3 className="text-base font-bold text-foreground">{t("faq.accountQuestion")}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("faq.accountAnswer")}</p>
              </article>
              <article className="rounded-[18px] border border-border bg-card p-6">
                <h3 className="text-base font-bold text-foreground">{t("faq.accessQuestion")}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("faq.accessAnswer")}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="px-6 py-16 sm:px-10 sm:py-20">
          <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[28px] bg-accent-soft px-8 py-12 sm:px-14 sm:py-16">
            <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(115deg, transparent 0px, transparent 38px, var(--accent-border) 38px, var(--accent-border) 40px)" }} />
            <div className="relative flex flex-col items-start gap-7 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[clamp(1.9rem,3.4vw,2.7rem)] leading-tight font-bold text-foreground">{t("final.heading")}</h2>
                <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-foreground/70">{t("final.description")}</p>
              </div>
              <EarlyAccessCta location="final" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
