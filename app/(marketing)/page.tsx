import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getPublicSiteUrl, toJsonLd } from "@/lib/seo/site";

import { BenefitCards } from "./benefit-cards";
import { FaqSection } from "./faq-section";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { PricingSection } from "./pricing-section";
import { ProductOverview } from "./product-overview";
import { ResultsStrip } from "./results-strip";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { FAQ_KEYS } from "./content";
import { UseCases } from "./testimonials";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: t("metadata.keywords").split(",").map((keyword) => keyword.trim()),
    alternates: { canonical: "/" },
    openGraph: {
      title: t("metadata.title"),
      description: t("metadata.description"),
      url: getPublicSiteUrl(),
      siteName: "Scale X",
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

export default async function MarketingHomePage() {
  const t = await getTranslations("marketing");
  const siteUrl = getPublicSiteUrl();
  const faqEntities = FAQ_KEYS.map((key) => ({
    "@type": "Question",
    name: t("faq." + key + ".question"),
    acceptedAnswer: {
      "@type": "Answer",
      text: t("faq." + key + ".answer"),
    },
  }));
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Scale X",
    url: siteUrl,
    logo: siteUrl + "/icon.png",
  };
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Scale X",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }} />

      <SiteHeader />

      <main>
        <HeroSection />
        <BenefitCards />
        <ResultsStrip />
        <ProductOverview />
        <HowItWorks />
        <PricingSection />
        <UseCases />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}
