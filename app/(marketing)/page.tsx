import type { Metadata } from "next";
import { Bot, LayoutDashboard, Send, Settings, Stethoscope, Target, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";

import { FaqAccordion } from "./faq-accordion";

export const metadata: Metadata = {
  title: "Scale X · Trouve le goulot qui te coûte le plus cher, puis corrige-le avec l'IA",
  description:
    "Scale X connecte ton Stripe, isole le bottleneck qui coûte le plus cher à ton info-business ce mois-ci, et déploie un agent Claude pour le corriger, pas juste un dashboard.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Scale X · Trouve le goulot qui te coûte le plus cher",
    description:
      "Diagnostic Stripe + agent IA qui corrige le bottleneck qui coûte le plus cher à ton info-business chaque mois.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scale X · Trouve le goulot qui te coûte le plus cher",
    description:
      "Diagnostic Stripe + agent IA qui corrige le bottleneck qui coûte le plus cher à ton info-business chaque mois.",
  },
};

const PROBLEMS = [
  {
    tag: "$",
    stat: "6–9% du MRR",
    title: "Paiements échoués",
    desc: "Des clients veulent payer. Leur carte a juste expiré ou la banque a bloqué la transaction.",
  },
  {
    tag: "%",
    stat: "1 client sur 5",
    title: "Churn silencieux",
    desc: "Part sans jamais ouvrir un ticket. Le signal était visible 3 semaines avant.",
  },
  {
    tag: "→",
    stat: "Jusqu'à 40% de perte",
    title: "Funnel qui fuit",
    desc: "Entre le clic et l'achat, l'argent s'évapore à une étape précise. Personne ne la regarde.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connecte Stripe",
    desc: "2 minutes, lecture seule, zéro configuration technique.",
  },
  {
    n: "02",
    title: "Le diagnostic tourne",
    desc: "Scale X analyse paiements, churn et funnel pour isoler LE bottleneck qui te coûte le plus cher ce mois-ci.",
  },
  {
    n: "03",
    title: "L'agent IA agit",
    desc: "Tu reçois un plan d'action concret, ou tu laisses l'agent l'exécuter pour toi.",
  },
];

const FEATURES = [
  {
    tag: "DIAGNOSTIC",
    title: "Santé business en temps réel",
    desc: "Acquisition, ascension, rétention : un statut clair (Sain, À surveiller, Critique) pour chaque zone.",
  },
  {
    tag: "AGENT IA",
    title: "Un agent propulsé par Claude",
    desc: "Il transforme chaque anomalie détectée en insight actionnable et en todo list priorisée par impact $.",
  },
  {
    tag: "KPI",
    title: "Les métriques qui comptent",
    desc: "Pas 40 graphiques. Les chiffres qui bougent vraiment ton MRR ce mois-ci.",
  },
  {
    tag: "INTÉGRATIONS",
    title: "Connecté à ton stack",
    desc: "Stripe aujourd'hui. Meta, TikTok et Instagram bientôt, pour couvrir tout le funnel.",
  },
];

const PRICING = [
  {
    key: "starter",
    name: "Starter",
    price: "49",
    tagline: "Pour valider où tu perds de l'argent.",
    feats: [
      "Diagnostic Stripe complet",
      "1 catégorie active",
      "Insights hebdomadaires",
      "Support email",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    price: "149",
    tagline: "Pour corriger activement chaque mois.",
    feats: [
      "Toutes les catégories",
      "Agent IA illimité",
      "Alertes en temps réel",
      "Support prioritaire",
    ],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "399",
    tagline: "Pour les équipes qui délèguent.",
    feats: [
      "Tout Growth inclus",
      "Intégrations Ads (Meta, TikTok)",
      "Accès prioritaire aux features",
      "Account manager dédié",
    ],
  },
];

const FAQS = [
  {
    q: "Est-ce que Scale X remplace mon CRM ou mon outil d'emailing ?",
    a: "Non. Scale X ne remplace rien : il regarde ce qui se passe déjà dans ton Stripe et te dit quoi corriger en premier. Tu gardes tes outils actuels.",
  },
  {
    q: "Mes données Stripe sont-elles en sécurité ?",
    a: "Oui. La connexion est en lecture seule par défaut : Scale X ne peut pas déplacer d'argent sans ton autorisation explicite.",
  },
  {
    q: "Combien de temps avant de voir des résultats ?",
    a: "Le diagnostic tourne en quelques minutes après la connexion. Les premières actions correctives peuvent générer un impact dès la première semaine.",
  },
  {
    q: "Je n'ai pas encore tout mon funnel sur Stripe, ça marche quand même ?",
    a: "Oui. Scale X démarre avec Stripe seul et s'enrichit au fur et à mesure que tu connectes tes autres apps (Insta, TikTok, etc.).",
  },
];

const SIDEBAR_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "KPI", icon: Send, active: false },
  { label: "Diagnostic", icon: Stethoscope, active: false },
  { label: "Closing", icon: Target, active: false },
  { label: "Agent IA", icon: Bot, active: false },
  { label: "Intégrations", icon: Plug, active: false },
  { label: "Réglages", icon: Settings, active: false },
];

const PREVIEW_KPIS = [
  { label: "MRR", value: "$18,420", delta: "+4.2%", good: true },
  { label: "Churn rate", value: "3.8%", delta: "-0.6pt", good: true },
  { label: "Paiements échoués", value: "$2,340", delta: "Critique", good: false },
  { label: "Taux de conversion", value: "2.1%", delta: "Stable", good: true },
];

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Scale X",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Scale X diagnostique le goulot d'étranglement business qui coûte le plus cher à un info-business et déploie un agent IA qui le corrige, à partir du Stripe et de la clé Anthropic (BYOK) du client.",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/PreOrder",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function MarketingHomePage() {
  return (
    <div className="bg-mist">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-ink/10 bg-mist px-6 py-4 sm:px-12">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[10px] border border-ink bg-signal font-display text-base font-medium text-ink">
            S
          </div>
          <span className="font-display text-lg font-medium">Scale X</span>
        </div>
        <div className="hidden gap-8 text-sm font-medium md:flex">
          <a href="#produit" className="hover:opacity-65">
            Produit
          </a>
          <a href="#comment-ca-marche" className="hover:opacity-65">
            Comment ça marche
          </a>
          <a href="#pricing" className="hover:opacity-65">
            Pricing
          </a>
          <a href="#faq" className="hover:opacity-65">
            FAQ
          </a>
        </div>
        <Button asChild>
          <a href="/onboarding">Diagnostiquer mon business</a>
        </Button>
      </nav>

      <header
        className="flex scroll-mt-24 flex-col items-center gap-7 px-6 pt-16 pb-32 text-center sm:px-12 sm:pt-20 sm:pb-36"
        style={{
          background: "linear-gradient(135deg, #ECE9FB 0%, #FBF7F0 45%, #FCEEDD 100%)",
        }}
      >
        <span className="rounded-full border border-ink bg-white px-5 py-2 text-[13px] font-medium">
          Pour les infopreneurs qui font $10k–100k/mois
        </span>
        <h1 className="max-w-4xl text-[clamp(2.4rem,5.2vw,4rem)] leading-[1.06]">
          Ton business perd{" "}
          <span className="inline-block rounded-lg bg-signal px-2.5">de l&apos;argent</span>{" "}
          chaque mois. On te dit où. Et on le corrige.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-[#4B4760]">
          Scale X connecte ton Stripe, isole le bottleneck qui te coûte le plus cher ce
          mois-ci, et déploie un agent IA qui te donne le plan d&apos;action pour le
          corriger. Fini les dashboards que personne ne regarde.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            size="lg"
            asChild
            className="px-8 py-6 text-base shadow-[6px_6px_0_var(--signal)]"
          >
            <a href="/onboarding">Diagnostiquer mon business →</a>
          </Button>
          <a
            href="#comment-ca-marche"
            className="flex items-center rounded-full border border-ink bg-white px-8 py-4 text-base font-medium"
          >
            Voir comment ça marche
          </a>
        </div>
        <p className="text-[13px] font-medium tracking-wide text-ink/55 uppercase">
          Connecté à Stripe en 2 min · Résultats en 24h · Aucune carte requise
        </p>

        <div className="sticker-card mt-6 w-full max-w-lg -rotate-1 p-7 text-left">
          <div className="mb-3.5 flex items-center justify-between">
            <span className="rounded-full border border-ink bg-signal px-3 py-1 text-xs font-medium text-ink">
              Bottleneck #1 détecté
            </span>
            <span className="rounded-full bg-state-healthy-bg px-3 py-1 text-xs font-medium text-state-healthy">
              +12% MRR récupérable
            </span>
          </div>
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            Paiements échoués
          </p>
          <p className="font-display text-5xl font-medium">$2,340</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            manque à gagner détecté ce mois-ci
          </p>
        </div>
      </header>

      <section id="produit-agitation" className="mx-auto max-w-5xl px-6 py-28 sm:px-12">
        <h2 className="mx-auto max-w-3xl text-center text-[clamp(1.9rem,4vw,2.75rem)] leading-tight">
          Tu ne perds pas d&apos;argent par manque d&apos;effort.
          <br />
          Tu en perds parce que le problème est invisible.
        </h2>
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="sticker-card p-8">
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-ink bg-signal font-display text-xl font-medium text-ink">
                {p.tag}
              </div>
              <p className="mb-1.5 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                {p.stat}
              </p>
              <p className="mb-2.5 text-xl font-medium">{p.title}</p>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-14 max-w-xl text-center text-[17px] font-medium leading-relaxed">
          Un seul de ces problèmes, corrigé, peut représenter plus que ce que coûte Scale X
          sur 10 ans.
        </p>
      </section>

      <section id="comment-ca-marche" className="scroll-mt-24 bg-paper-alt px-6 py-28 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-16 max-w-xl text-center">
            <h2 className="mb-3 text-[clamp(1.9rem,4vw,2.75rem)]">Comment ça marche</h2>
            <p className="text-[17px] text-muted-foreground">
              Trois étapes. Aucune donnée à interpréter toi-même.
            </p>
          </div>
          <div className="grid gap-9 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-ink bg-white font-display text-xl font-medium">
                  {s.n}
                </div>
                <p className="mb-2.5 text-xl font-medium">{s.title}</p>
                <p className="text-[15.5px] leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-28 sm:px-12">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-[12.5px] font-medium tracking-wide text-signal uppercase">
            Écran app · après connexion
          </p>
          <h2 className="mb-3 text-[clamp(1.75rem,3.6vw,2.5rem)]">
            Le dashboard, ton point de départ chaque matin.
          </h2>
          <p className="text-base text-muted-foreground">
            Le bottleneck du moment, les KPI qui bougent, et un accès direct au plan
            d&apos;action, avant même de cliquer où que ce soit.
          </p>
        </div>
        <div className="sticker-card flex min-h-[420px] overflow-hidden p-0">
          <div className="hidden w-56 shrink-0 flex-col bg-ink px-3 py-6 text-mist sm:flex">
            <div className="mb-6 flex items-center gap-2 px-2">
              <div className="size-6 rounded-md border border-mist bg-signal" />
              <span className="font-display text-sm font-medium">Scale X</span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={
                    item.active
                      ? "rounded-lg bg-signal px-3 py-2 text-sm font-medium text-ink"
                      : "px-3 py-2 text-sm font-medium text-mist/70"
                  }
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-panel p-7">
            <p className="mb-1 font-display text-xl font-medium">Dashboard</p>
            <p className="mb-5 text-sm text-muted-foreground">
              Vue d&apos;ensemble de ton business, aujourd&apos;hui.
            </p>
            <div className="sticker-spotlight mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <span className="rounded-full bg-signal px-3 py-1 text-xs font-medium text-ink">
                  Bottleneck actuel
                </span>
                <p className="mt-3 font-display text-lg font-medium">
                  Paiements échoués : $2,340 détectés ce mois-ci
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-signal bg-signal px-4 py-2.5 text-sm font-medium text-ink">
                Voir le diagnostic complet →
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              {PREVIEW_KPIS.map((kpi) => (
                <div key={kpi.label} className="sticker-card p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="mb-2 font-display text-xl font-medium">{kpi.value}</p>
                  <span
                    className={
                      kpi.good
                        ? "rounded-full bg-state-healthy-bg px-2.5 py-0.5 text-xs font-medium text-state-healthy"
                        : "rounded-full bg-state-critical-bg px-2.5 py-0.5 text-xs font-medium text-state-critical"
                    }
                  >
                    {kpi.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="produit" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-28 sm:px-12">
        <div className="mx-auto mb-16 max-w-xl text-center">
          <h2 className="mb-3 text-[clamp(1.9rem,4vw,2.75rem)]">
            Tout ce dont tu as besoin, rien de plus
          </h2>
          <p className="text-[17px] text-muted-foreground">
            Pas une plateforme d&apos;analytics de plus. Un correcteur de bottlenecks.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="sticker-card p-8">
              <span className="mb-4 inline-block rounded-full border border-ink bg-paper-alt px-3 py-1 text-[11.5px] font-medium tracking-wide">
                {f.tag}
              </span>
              <p className="mb-2.5 text-xl font-medium">{f.title}</p>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 bg-paper-alt px-6 py-28 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-16 max-w-xl text-center">
            <h2 className="mb-3 text-[clamp(1.9rem,4vw,2.75rem)]">Pricing</h2>
            <p className="text-[17px] text-muted-foreground">
              Choisis ton niveau d&apos;implication. Annule quand tu veux.
            </p>
          </div>
          <div className="grid items-stretch gap-6 sm:grid-cols-3">
            {PRICING.map((tier) =>
              tier.highlight ? (
                <div
                  key={tier.key}
                  className="flex h-full flex-col rounded-2xl border border-ink bg-ink px-8 py-9 text-mist"
                  style={{ boxShadow: "7px 7px 0 var(--signal)" }}
                >
                  <span className="mb-4 self-start rounded-full bg-signal px-3.5 py-1 text-xs font-medium text-ink">
                    Plus populaire
                  </span>
                  <p className="mb-1 font-display text-xl font-medium">{tier.name}</p>
                  <p className="mb-5 text-sm text-mist/70">{tier.tagline}</p>
                  <p className="mb-6 font-display text-4xl font-medium">
                    ${tier.price}
                    <span className="text-base font-medium text-mist/60">/mois</span>
                  </p>
                  {tier.feats.map((feat) => (
                    <div key={feat} className="mb-3 flex gap-2.5 text-sm">
                      <span className="font-medium text-signal">✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                  <Button
                    asChild
                    className="mt-auto border-signal bg-signal text-ink hover:opacity-90"
                  >
                    <a href="/onboarding">Choisir {tier.name}</a>
                  </Button>
                </div>
              ) : (
                <div key={tier.key} className="sticker-card flex h-full flex-col px-8 py-9">
                  <p className="mb-1 font-display text-xl font-medium">{tier.name}</p>
                  <p className="mb-5 text-sm text-muted-foreground">{tier.tagline}</p>
                  <p className="mb-6 font-display text-4xl font-medium">
                    ${tier.price}
                    <span className="text-base font-medium text-muted-foreground">/mois</span>
                  </p>
                  {tier.feats.map((feat) => (
                    <div key={feat} className="mb-3 flex gap-2.5 text-sm text-muted-foreground">
                      <span className="font-medium text-ink">✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                  <Button variant="outline" asChild className="mt-auto">
                    <a href="/onboarding">Choisir {tier.name}</a>
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-2xl scroll-mt-24 px-6 py-28 sm:px-12">
        <h2 className="mb-12 text-center text-[clamp(1.9rem,4vw,2.75rem)]">
          Questions fréquentes
        </h2>
        <FaqAccordion items={FAQS} />
      </section>

      <section className="bg-ink px-6 py-28 text-center text-mist sm:px-12">
        <h2 className="mx-auto mb-5 max-w-2xl text-[clamp(1.9rem,4.5vw,2.9rem)] leading-tight">
          Ton prochain client va payer. La question, c&apos;est combien tu en perds avant
          qu&apos;il le fasse.
        </h2>
        <p className="mx-auto mb-9 max-w-lg text-[17px] text-mist/70">
          Connecte Stripe, obtiens ton diagnostic, et laisse l&apos;agent te montrer où agir
          en premier.
        </p>
        <Button asChild className="border-signal bg-signal px-8 py-6 text-base text-ink">
          <a href="/onboarding">Diagnostiquer mon business →</a>
        </Button>
      </section>

      <footer className="bg-[#100e1a] px-6 py-16 text-mist sm:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap justify-between gap-12 border-b border-mist/15 pb-11">
            <div className="max-w-70">
              <div className="mb-3.5 flex items-center gap-2.5">
                <div className="size-7 rounded-lg border border-mist bg-signal" />
                <span className="font-display text-lg font-medium">Scale X</span>
              </div>
              <p className="text-sm leading-relaxed text-mist/60">
                Le diagnostic et l&apos;agent IA qui corrigent le bottleneck qui coûte le
                plus cher à ton info-business.
              </p>
            </div>
            <div className="flex flex-wrap gap-16">
              <div>
                <p className="mb-4 text-[13px] font-medium tracking-wide text-mist/50 uppercase">
                  Produit
                </p>
                <div className="flex flex-col gap-3 text-[14.5px]">
                  <a href="#produit" className="text-mist/80 hover:text-mist">
                    Fonctionnalités
                  </a>
                  <a href="#pricing" className="text-mist/80 hover:text-mist">
                    Pricing
                  </a>
                  <a href="#faq" className="text-mist/80 hover:text-mist">
                    FAQ
                  </a>
                </div>
              </div>
              <div>
                <p className="mb-4 text-[13px] font-medium tracking-wide text-mist/50 uppercase">
                  Ressources
                </p>
                <div className="flex flex-col gap-3 text-[14.5px]">
                  <a href="#" className="text-mist/80 hover:text-mist">
                    Blog
                  </a>
                  <a href="#" className="text-mist/80 hover:text-mist">
                    Guides infopreneurs
                  </a>
                </div>
              </div>
              <div>
                <p className="mb-4 text-[13px] font-medium tracking-wide text-mist/50 uppercase">
                  Légal
                </p>
                <div className="flex flex-col gap-3 text-[14.5px]">
                  <a href="#" className="text-mist/80 hover:text-mist">
                    CGU
                  </a>
                  <a href="#" className="text-mist/80 hover:text-mist">
                    Confidentialité
                  </a>
                </div>
              </div>
            </div>
          </div>
          <p className="pt-7 text-[13px] text-mist/50">© 2026 Scale X. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
