import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Scale X — Find your business bottleneck, then fix it with AI",
  description:
    "Scale X diagnoses the single bottleneck costing your info business the most revenue, then deploys a Claude-powered agent to fix it — not just a dashboard.",
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Scale X",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Scale X diagnoses the business bottleneck costing an info business the most revenue and deploys an AI agent that fixes it, using the founder's own Stripe data and their own Anthropic API key (BYOK).",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/PreOrder",
  },
};

export default function MarketingHomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationJsonLd),
        }}
      />

      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        For $10k–100k/month info businesses
      </span>

      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Scale X finds the one bottleneck costing your info business the most
        money each month — then deploys an AI agent that fixes it.
      </h1>

      <p className="max-w-2xl text-lg text-muted-foreground">
        Most infopreneurs doing $10k–100k/month are losing thousands every
        month to a single, fixable bottleneck buried in their Stripe data.
        Scale X reads your own Stripe account, calculates exactly where the
        money leaks, and deploys a Claude-powered agent to correct it — not
        another dashboard you have to interpret yourself.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" asChild>
          <a href="/dashboard">Diagnose my business</a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="mailto:hello@scalex.app">Talk to us</a>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Bring your own Stripe account and your own Anthropic API key — Scale X
        never touches a shared key or a shared account.
      </p>
    </main>
  );
}
