import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import dashboardEn from "@/locales/en/dashboard.json";
import dashboardFr from "@/locales/fr/dashboard.json";
import funnelBlocksEn from "@/locales/en/funnelBlocks.json";
import funnelBlocksFr from "@/locales/fr/funnelBlocks.json";
import navigationEn from "@/locales/en/navigation.json";
import navigationFr from "@/locales/fr/navigation.json";
import type { BottleneckFunnelData, BottleneckStage } from "@/lib/dashboard/bottleneck";

vi.mock("@/lib/improve-chat-tracking", () => ({ recordImproveChatOpened: vi.fn() }));

import { BottleneckFunnel } from "./bottleneck-funnel";

const stages: BottleneckStage[] = [
  {
    id: "views",
    volume: 1000,
    currentRate: null,
    benchmarkRate: null,
    monthlyGain: null,
    metricKey: null,
    isReliable: true,
    noteKey: null,
    source: "content",
    label: "Video views",
    sourceHref: "/acquisition/contenu",
  },
  {
    id: "sequence_email:email_sends",
    volume: 150,
    currentRate: 0.4,
    benchmarkRate: 0.5,
    monthlyGain: 250,
    metricKey: "email_sends",
    isReliable: true,
    noteKey: null,
    source: "content",
    label: "Email sends",
    sourceHref: "/acquisition/sequence-email",
    sourcePageLabel: "Email sequence",
  },
  {
    id: "vente_directe:sales_page_visitors",
    volume: 80,
    currentRate: 0.1,
    benchmarkRate: 0.2,
    monthlyGain: 500,
    metricKey: "sales_page_visitors",
    isReliable: true,
    noteKey: null,
    source: "sales",
    label: "Sales page visitors",
    sourceHref: "/acquisition/page-de-vente",
  },
];

const variants: NonNullable<BottleneckFunnelData["variants"]> = [
  {
    catalogKey: "sales_page",
    catalogLabel: "Sales page",
    stages,
    bottleneckId: stages[2]?.id ?? null,
    totalPotential: 750,
    sales: 4,
    revenue: 2000,
  },
  {
    catalogKey: "email_sequence",
    catalogLabel: "Email sequence",
    stages,
    bottleneckId: stages[1]?.id ?? null,
    totalPotential: 250,
    sales: 2,
    revenue: 1000,
  },
];

const data: BottleneckFunnelData = {
  ...variants[0]!,
  activeFunnelKey: "sales_page",
  variants,
};

function renderFunnel(locale: "fr" | "en"): string {
  const messages = locale === "fr"
    ? { dashboard: dashboardFr, navigation: navigationFr, funnelBlocks: funnelBlocksFr }
    : { dashboard: dashboardEn, navigation: navigationEn, funnelBlocks: funnelBlocksEn };

  return renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <BottleneckFunnel data={data} />
    </NextIntlClientProvider>
  );
}

describe("BottleneckFunnel", () => {
  it.each([
    ["fr", "Source : Contenu", "Source : Séquence email", "Source : Vente directe", "Parcours d’acquisition"],
    ["en", "Source: Content", "Source: Email sequence", "Source: Direct sales", "Acquisition journey"],
  ] as const)("renders localized source links, inline summary, and journey options in %s", (locale, ...expected) => {
    const html = renderFunnel(locale);

    for (const text of expected) expect(html).toContain(text);
    expect(html).toContain('data-testid="bottleneck-summary-inline"');
    expect(html).not.toContain('data-testid="bottleneck-summary-button"');
    expect(html).not.toContain('data-testid="bottleneck-summary-dialog"');
    expect(html).toContain('href="/acquisition/contenu"');
    expect(html).toContain('href="/acquisition/sequence-email"');
    expect(html).toContain('href="/acquisition/page-de-vente"');
    expect(html).toContain('value="sales_page" selected');
    expect(html).toContain('value="email_sequence"');
  });
});
