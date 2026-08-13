import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { getPublicSiteUrl, toJsonLd } from "@/lib/seo/site";

import { RESOURCE_FAQ_KEYS } from "../../content";
import { SiteFooter } from "../../site-footer";
import { SiteHeader } from "../../site-header";

const RESOURCE_PATH = "/ressources/coach-business-scaling";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return {
    title: t("resource.title") + " | Minaly",
    description: t("resource.intro"),
    alternates: { canonical: RESOURCE_PATH },
    openGraph: {
      title: t("resource.title") + " | Minaly",
      description: t("resource.intro"),
      url: getPublicSiteUrl() + RESOURCE_PATH,
      siteName: "Minaly",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: t("resource.title") + " | Minaly",
      description: t("resource.intro"),
    },
    robots: { index: true, follow: true },
  };
}

export default async function CoachBusinessScalingResourcePage() {
  const t = await getTranslations("marketing");
  const locale = await getLocale();
  const siteUrl = getPublicSiteUrl();
  const faqEntities = RESOURCE_FAQ_KEYS.map((key) => ({
    "@type": "Question",
    name: t("resource." + key + "Question"),
    acceptedAnswer: {
      "@type": "Answer",
      text: t("resource." + key + "Answer"),
    },
  }));
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: t("resource.title"),
    description: t("resource.intro"),
    inLanguage: locale,
    mainEntityOfPage: siteUrl + RESOURCE_PATH,
    author: { "@type": "Organization", name: "Minaly", url: siteUrl },
    publisher: { "@type": "Organization", name: "Minaly", url: siteUrl },
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Minaly",
    url: siteUrl,
    logo: siteUrl + "/icon.png",
  };
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Minaly",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Scaling coach software",
    operatingSystem: "Web",
    description: t("metadata.description"),
    url: siteUrl,
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntities,
  };

  return (
    <div className="bg-dot-grid bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(organizationJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(softwareApplicationJsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }} />
      <SiteHeader />
      <main>
        <article className="mx-auto max-w-4xl px-6 py-16 sm:px-10 sm:py-24">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.14em] text-accent">{t("resource.eyebrow")}</p>
          <h1 className="max-w-3xl text-[clamp(2.3rem,5vw,4rem)] leading-[1.05] font-bold tracking-tight text-foreground">
            {t("resource.title")}
          </h1>
          <p className="mt-7 max-w-3xl text-[18px] leading-relaxed text-muted-foreground">{t("resource.intro")}</p>

          <div className="mt-12 grid gap-8">
            <section className="rounded-[20px] border border-accent-border bg-accent-soft p-7 sm:p-9">
              <h2 className="text-2xl font-bold text-foreground">{t("resource.answerHeading")}</h2>
              <p className="mt-3 text-[16px] leading-relaxed text-foreground">{t("resource.answer")}</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground">{t("resource.frameworkHeading")}</h2>
              <div className="mt-6 grid gap-5">
                <div className="rounded-[18px] border border-border bg-white p-6">
                  <h3 className="text-lg font-bold text-foreground">{t("resource.framework1Title")}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{t("resource.framework1")}</p>
                </div>
                <div className="rounded-[18px] border border-border bg-white p-6">
                  <h3 className="text-lg font-bold text-foreground">{t("resource.framework2Title")}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{t("resource.framework2")}</p>
                </div>
                <div className="rounded-[18px] border border-border bg-white p-6">
                  <h3 className="text-lg font-bold text-foreground">{t("resource.framework3Title")}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{t("resource.framework3")}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-border bg-white p-7 sm:p-9">
              <h2 className="text-2xl font-bold text-foreground">{t("resource.weeklyHeading")}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t("resource.weekly")}</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground">{t("resource.toolHeading")}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t("resource.tool")}</p>
              <Link
                href="/sign-in"
                className="mt-6 inline-flex rounded-[12px] bg-accent px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
              >
                {t("resource.cta")}
              </Link>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground">{t("resource.faqHeading")}</h2>
              <div className="mt-5 divide-y divide-border rounded-[18px] border border-border bg-white">
                {RESOURCE_FAQ_KEYS.map((key) => (
                  <details key={key} className="p-6">
                    <summary className="cursor-pointer list-none pr-8 font-bold text-foreground marker:hidden">
                      {t("resource." + key + "Question")}
                    </summary>
                    <p className="mt-3 leading-relaxed text-muted-foreground">{t("resource." + key + "Answer")}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
