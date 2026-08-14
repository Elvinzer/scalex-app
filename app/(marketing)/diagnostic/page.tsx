import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { getPublicSiteUrl } from "@/lib/seo/site";

import { GrowthDiagnostic } from "../growth-diagnostic";
import { SiteHeader } from "../site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("growthDiagnostic");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: t("metadata.keywords").split(",").map((keyword) => keyword.trim()),
    alternates: { canonical: "/diagnostic" },
    openGraph: {
      title: t("metadata.title"),
      description: t("metadata.description"),
      url: getPublicSiteUrl() + "/diagnostic",
      siteName: "Minaly",
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function FreeDiagnosticPage() {
  const benchmarks = await getDiagnosticBenchmarks(null);

  return (
    <div className="bg-dot-grid min-h-screen bg-white">
      <SiteHeader />
      <main className="px-4 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
        <GrowthDiagnostic benchmarks={benchmarks} fullPage />
      </main>
    </div>
  );
}
