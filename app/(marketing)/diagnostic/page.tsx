import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getPublicSiteUrl } from "@/lib/seo/site";

import { FreeDiagnosticFlow } from "./free-diagnostic-flow";
import { SiteHeader } from "../site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("freeDiagnostic");
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

export default function FreeDiagnosticPage() {
  return (
    <div className="bg-dot-grid min-h-screen bg-white">
      <SiteHeader />
      <FreeDiagnosticFlow />
    </div>
  );
}
