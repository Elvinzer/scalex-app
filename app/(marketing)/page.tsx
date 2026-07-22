import type { Metadata } from "next";

import { BenefitCards } from "./benefit-cards";
import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { PricingSection } from "./pricing-section";
import { ProductOverview } from "./product-overview";
import { ResultsStrip } from "./results-strip";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { Testimonials } from "./testimonials";

export const metadata: Metadata = {
  title: "Scale X — Détecte les pertes qui freinent ta croissance",
  description:
    "Scale X identifie les fuites de chiffre d'affaires dans ton acquisition, ta conversion et tes opérations, puis te montre quoi corriger en priorité.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Scale X — Détecte les pertes qui freinent ta croissance",
    description:
      "Scale X identifie les fuites de chiffre d'affaires dans ton acquisition, ta conversion et tes opérations, puis te montre quoi corriger en priorité.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scale X — Détecte les pertes qui freinent ta croissance",
    description:
      "Scale X identifie les fuites de chiffre d'affaires dans ton acquisition, ta conversion et tes opérations, puis te montre quoi corriger en priorité.",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Scale X",
  url: "https://scalex.app",
  logo: "https://scalex.app/icon.png",
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Scale X",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Scale X détecte les fuites de chiffre d'affaires dans l'acquisition, la conversion et les opérations d'un business en ligne, et priorise les actions à corriger en premier.",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/PreOrder",
  },
};

export default function MarketingHomePage() {
  return (
    <div className="bg-dot-grid bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />

      <SiteHeader />

      <main>
        <HeroSection />
        <BenefitCards />
        <ResultsStrip />
        <ProductOverview />
        <HowItWorks />
        <PricingSection />
        <Testimonials />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}
