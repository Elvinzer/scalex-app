import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { getPublicSiteUrl, toJsonLd } from "@/lib/seo/site";

import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";

const PRIVACY_POLICY_PATH = "/politique-de-confidentialite";
const CONTACT_EMAIL = "contact@minaly.io";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  const title = t("privacyPolicy.metadata.title");
  const description = t("privacyPolicy.metadata.description");

  return {
    title,
    description,
    alternates: { canonical: PRIVACY_POLICY_PATH },
    openGraph: {
      title,
      description,
      url: getPublicSiteUrl() + PRIVACY_POLICY_PATH,
      siteName: "Minaly",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

type Section = { id: string; title: string; body: ReactNode };

function EmailLink({ children }: { children: ReactNode }) {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent hover:underline">
      {children}
    </a>
  );
}

function CnilLink({ children }: { children: ReactNode }) {
  return (
    <a
      href="https://www.cnil.fr"
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-accent hover:underline"
    >
      {children}
    </a>
  );
}

export default async function PrivacyPolicyPage() {
  const t = await getTranslations("marketing");
  const siteUrl = getPublicSiteUrl();
  const richValues = {
    code: (chunks: ReactNode) => (
      <code className="rounded bg-surface-sunken px-1 py-0.5 text-[13px]">{chunks}</code>
    ),
    cnil: (chunks: ReactNode) => <CnilLink>{chunks}</CnilLink>,
    email: (chunks: ReactNode) => <EmailLink>{chunks}</EmailLink>,
    strong: (chunks: ReactNode) => <strong className="text-foreground">{chunks}</strong>,
  };
  const sections: Section[] = [
    {
      id: "responsable-de-traitement",
      title: t("privacyPolicy.sections.controller.title"),
      body: <p>{t.rich("privacyPolicy.sections.controller.body", richValues)}</p>,
    },
    {
      id: "donnees-collectees",
      title: t("privacyPolicy.sections.collectedData.title"),
      body: (
        <>
          <p>{t("privacyPolicy.sections.collectedData.intro")}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t.rich("privacyPolicy.sections.collectedData.account", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.collectedData.billing", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.collectedData.anthropicKey", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.collectedData.connectedBusiness", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.collectedData.usage", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.collectedData.correspondence", richValues)}</li>
          </ul>
        </>
      ),
    },
    {
      id: "finalites-base-legale",
      title: t("privacyPolicy.sections.purposes.title"),
      body: (
        <>
          <p>{t("privacyPolicy.sections.purposes.intro")}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("privacyPolicy.sections.purposes.provide")}</li>
            <li>{t("privacyPolicy.sections.purposes.diagnose")}</li>
            <li>{t("privacyPolicy.sections.purposes.weeklyBrief")}</li>
            <li>{t("privacyPolicy.sections.purposes.billing")}</li>
            <li>{t("privacyPolicy.sections.purposes.improve")}</li>
            <li>{t("privacyPolicy.sections.purposes.security")}</li>
            <li>{t("privacyPolicy.sections.purposes.support")}</li>
          </ul>
          <p>{t("privacyPolicy.sections.purposes.automatedDecisions")}</p>
        </>
      ),
    },
    {
      id: "integrations-tierces",
      title: t("privacyPolicy.sections.integrations.title"),
      body: (
        <>
          <p>{t("privacyPolicy.sections.integrations.intro")}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t.rich("privacyPolicy.sections.integrations.stripe", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.integrations.iclosed", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.integrations.calendly", richValues)}</li>
            <li>{t.rich("privacyPolicy.sections.integrations.instagram", richValues)}</li>
          </ul>
          <p>{t("privacyPolicy.sections.integrations.processorRole")}</p>
        </>
      ),
    },
    {
      id: "partage-sous-traitants",
      title: t("privacyPolicy.sections.sharing.title"),
      body: (
        <>
          <p>{t("privacyPolicy.sections.sharing.intro")}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("privacyPolicy.sections.sharing.vercel")}</li>
            <li>{t("privacyPolicy.sections.sharing.supabase")}</li>
            <li>{t("privacyPolicy.sections.sharing.stripe")}</li>
            <li>{t("privacyPolicy.sections.sharing.anthropic")}</li>
            <li>{t("privacyPolicy.sections.sharing.resend")}</li>
            <li>{t("privacyPolicy.sections.sharing.inngest")}</li>
            <li>{t("privacyPolicy.sections.sharing.posthog")}</li>
            <li>{t("privacyPolicy.sections.sharing.meta")}</li>
            <li>{t("privacyPolicy.sections.sharing.iclosedCalendly")}</li>
          </ul>
        </>
      ),
    },
    {
      id: "cookies",
      title: t("privacyPolicy.sections.cookies.title"),
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t.rich("privacyPolicy.sections.cookies.essential", richValues)}</li>
          <li>{t.rich("privacyPolicy.sections.cookies.analytics", richValues)}</li>
          <li>{t("privacyPolicy.sections.cookies.noAdvertising")}</li>
        </ul>
      ),
    },
    {
      id: "duree-conservation",
      title: t("privacyPolicy.sections.retention.title"),
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t("privacyPolicy.sections.retention.account")}</li>
          <li>{t("privacyPolicy.sections.retention.afterCancellation")}</li>
          <li>{t("privacyPolicy.sections.retention.technicalLogs")}</li>
          <li>{t("privacyPolicy.sections.retention.integrations")}</li>
        </ul>
      ),
    },
    {
      id: "transferts-hors-ue",
      title: t("privacyPolicy.sections.internationalTransfers.title"),
      body: <p>{t("privacyPolicy.sections.internationalTransfers.body")}</p>,
    },
    {
      id: "securite",
      title: t("privacyPolicy.sections.security.title"),
      body: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t("privacyPolicy.sections.security.apiKeys")}</li>
          <li>{t("privacyPolicy.sections.security.connections")}</li>
          <li>{t("privacyPolicy.sections.security.rls")}</li>
          <li>{t("privacyPolicy.sections.security.productionAccess")}</li>
        </ul>
      ),
    },
    {
      id: "vos-droits",
      title: t("privacyPolicy.sections.rights.title"),
      body: (
        <>
          <p>{t("privacyPolicy.sections.rights.intro")}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("privacyPolicy.sections.rights.access")}</li>
            <li>{t("privacyPolicy.sections.rights.restriction")}</li>
            <li>{t("privacyPolicy.sections.rights.objection")}</li>
            <li>{t("privacyPolicy.sections.rights.consent")}</li>
          </ul>
          <p>{t.rich("privacyPolicy.sections.rights.complaint", richValues)}</p>
        </>
      ),
    },
    {
      id: "suppression-instagram",
      title: t("privacyPolicy.sections.instagramData.title"),
      body: <p>{t.rich("privacyPolicy.sections.instagramData.body", richValues)}</p>,
    },
    {
      id: "mineurs",
      title: t("privacyPolicy.sections.minors.title"),
      body: <p>{t("privacyPolicy.sections.minors.body")}</p>,
    },
    {
      id: "modifications",
      title: t("privacyPolicy.sections.changes.title"),
      body: <p>{t("privacyPolicy.sections.changes.body")}</p>,
    },
    {
      id: "contact",
      title: t("privacyPolicy.sections.contact.title"),
      body: <p>{t.rich("privacyPolicy.sections.contact.body", richValues)}</p>,
    },
  ];
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
    url: siteUrl,
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: t("privacy.faqQuestion"),
        acceptedAnswer: {
          "@type": "Answer",
          text: t("privacy.faqAnswer"),
        },
      },
    ],
  };

  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(organizationJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(softwareApplicationJsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }} />
      <SiteHeader />

      <main className="px-6 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-[760px]">
          <p className="mb-3 text-[13.5px] font-semibold tracking-wide text-accent uppercase">Minaly</p>
          <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-bold text-foreground">
            {t("privacyPolicy.pageTitle")}
          </h1>
          <p className="mt-3 text-[14.5px] text-muted-foreground">
            {t("privacyPolicy.lastUpdatedLabel", { date: t("privacyPolicy.lastUpdated") })}
          </p>

          <p className="mt-8 text-[15.5px] leading-relaxed text-muted-foreground">
            {t("privacyPolicy.intro")}
          </p>

          <nav
            aria-label={t("privacyPolicy.contentsAriaLabel")}
            className="mt-10 rounded-[var(--radius-card)] border border-border bg-surface-sunken p-6"
          >
            <p className="mb-3 text-[13px] font-bold tracking-wide text-foreground uppercase">
              {t("privacyPolicy.contentsTitle")}
            </p>
            <ol className="grid gap-x-6 gap-y-1.5 text-[14px] text-muted-foreground sm:grid-cols-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="transition-colors hover:text-accent">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-4 divide-y divide-border">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 py-8">
                <h2 className="mb-3 text-[19px] font-bold text-foreground">{section.title}</h2>
                <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{section.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
