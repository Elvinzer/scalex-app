// Route -> "what is Falco an expert in, right here, and what should he open
// the conversation by proposing".
//
// Why this exists as its own map rather than reusing lib/falco-skins.ts's
// AGENT_ROUTE_RULES: that map answers "which lever bucket does this route
// belong to" (4 buckets, for the Copilote deep link). This one answers a
// finer question — /acquisition/contenu/youtube and /acquisition/contenu/
// instagram share the `content` lever but have completely different data
// and completely different openings ("gagner des abonnés" vs "faire cliquer
// en story"). The pageKey is what travels to the server as
// ChatContext.sourcePage, which is the ONLY client-sent field the API
// doesn't overwrite from the conversation row (see app/api/improve-chat/
// route.ts) — so it's the channel a page hook has to ride on.
//
// `dataKey` selects the server-side data block (lib/agent/page-agent-data.ts).
// `leverKey` reuses an existing lever builder when one already covers the
// page exactly; dataKey wins when a page needs its own narrower slice.

export type PageDataKey = "youtube" | "instagram";

export type PageAgentContext = {
  pageKey: string;
  label: string;
  // One line, injected verbatim as the expertise framing. Written as "tu es
  // …" so it reads as an instruction to the model.
  specialty: string;
  // The concrete outcome Falco must propose in his opening message. Kept
  // outcome-shaped ("faire gagner des abonnés ou des RDV"), never
  // task-shaped, so the model picks the task from the real data.
  hook: string;
  // Existing lever data builder to reuse (lib/agent/lever-agent-data.ts).
  leverKey?: string;
  // Page-specific data builder, when no lever covers this slice.
  dataKey?: PageDataKey;
};

// Longest prefix first — resolvePageContext returns the first match, so
// /acquisition/contenu/youtube must be tested before /acquisition/contenu.
const PAGE_RULES: { prefix: string; context: PageAgentContext }[] = [
  {
    prefix: "/acquisition/contenu/youtube",
    context: {
      pageKey: "page_contenu_youtube",
      label: "Contenu YouTube",
      specialty:
        "tu es expert YouTube : hooks des 30 premières secondes, rétention, titres et miniatures, formats Shorts vs longue durée, et surtout conversion d'une vue en abonné puis en RDV",
      hook:
        "analyse brièvement ses chiffres YouTube (rétention, vues, abonnés gagnés, RDV bookés par vidéo) puis propose UN sujet ou format de vidéo précis à produire ensuite, en disant s'il vise surtout des abonnés ou des RDV bookés",
      dataKey: "youtube",
    },
  },
  {
    prefix: "/acquisition/contenu/instagram",
    context: {
      pageKey: "page_contenu_instagram",
      label: "Contenu Instagram",
      specialty:
        "tu es expert Instagram : hooks des 3 premières secondes, Reels, portée vs engagement, stories qui font cliquer, et conversion d'une vue en lead",
      hook:
        "analyse brièvement ses chiffres Instagram (portée, engagement, formats qui marchent) puis propose UN post ou Reel précis à produire ensuite pour transformer ces vues en leads",
      dataKey: "instagram",
    },
  },
  {
    prefix: "/acquisition/contenu",
    context: {
      pageKey: "page_contenu",
      label: "Contenu",
      specialty: "tu es expert contenu organique multi-plateformes : angles, hooks, rythme de publication, recyclage",
      hook: "compare brièvement la performance de ses réseaux puis propose sur lequel concentrer son prochain contenu, et lequel produire",
      leverKey: "content",
    },
  },
  {
    prefix: "/acquisition/mail",
    context: {
      pageKey: "page_mail",
      label: "Emailing",
      specialty: "tu es expert email marketing : objets, séquences de bienvenue, réactivation, structure d'un email qui convertit",
      hook: "analyse brièvement ses taux d'ouverture et de clic puis propose UN email ou une séquence précise à écrire ensuite",
      leverKey: "email_marketing",
    },
  },
  {
    prefix: "/ventes/pipeline",
    context: {
      pageKey: "page_pipeline",
      label: "Pipeline",
      specialty: "tu es expert prospection et setting : messages de premier contact, relances, qualification, passage du lead au RDV",
      hook: "repère brièvement où ses leads bloquent dans le pipeline puis propose UNE action de relance ou de qualification à lancer aujourd'hui",
      leverKey: "setting",
    },
  },
  {
    prefix: "/ventes/setters",
    context: {
      pageKey: "page_setters",
      label: "Setters",
      specialty: "tu es expert pilotage d'équipe de setting : rémunération, objectifs, suivi de performance individuelle",
      hook: "analyse brièvement la performance de ses setters puis propose UNE action concrète pour faire progresser le plus faible ou répliquer ce que fait le meilleur",
      leverKey: "setting",
    },
  },
  {
    prefix: "/acquisition/ads",
    context: {
      pageKey: "page_ads",
      label: "Ads",
      specialty: "tu es expert publicité payante : angles créatifs, ciblage, coût par lead, structure de campagne",
      hook: "analyse brièvement son coût par résultat puis propose UNE créa ou UN ajustement de campagne à tester ensuite",
      leverKey: "ads",
    },
  },
  {
    prefix: "/ventes/appels",
    context: {
      pageKey: "page_appels",
      label: "Suivi des appels",
      specialty: "tu es expert closing high-ticket : structure d'appel, traitement des objections, taux de présence, relance post-appel",
      hook: "analyse brièvement son taux de présence et de closing puis propose UNE correction précise à appliquer sur ses prochains appels",
      leverKey: "closing",
    },
  },
  {
    prefix: "/ventes/rdv",
    context: {
      pageKey: "page_rdv",
      label: "Rendez-vous",
      specialty: "tu es expert prise de rendez-vous : page de réservation, réduction des no-shows, rappels, répartition entre closers",
      hook: "regarde brièvement ses RDV à venir et ses relances en attente puis propose UNE action pour sécuriser la présence à ces appels",
      leverKey: "closing",
    },
  },
  {
    prefix: "/business",
    context: {
      pageKey: "page_business",
      label: "Mon business",
      specialty: "tu es expert structuration d'offre, pricing et ascension client : promesse, packaging, niveaux de prix, offre complémentaire",
      hook: "analyse brièvement son offre principale et son ascension client puis propose UNE amélioration précise à configurer dans Mon business",
      leverKey: "ventes",
    },
  },
  {
    prefix: "/ventes/suivi",
    context: {
      pageKey: "page_suivi_ventes",
      label: "Suivi des ventes",
      specialty: "tu es expert pilotage du chiffre d'affaires : panier moyen, échéanciers, encaissements, mix d'offres",
      hook: "analyse brièvement l'évolution de son chiffre d'affaires puis propose UN levier précis pour l'augmenter le mois prochain",
      leverKey: "ventes",
    },
  },
  {
    prefix: "/ventes",
    context: {
      pageKey: "page_ventes",
      label: "Vente",
      specialty: "tu es expert vente : closing, offres, ascension client",
      hook: "repère brièvement le maillon le plus faible de sa vente puis propose UNE action pour le corriger",
      leverKey: "ventes",
    },
  },
  {
    prefix: "/acquisition",
    context: {
      pageKey: "page_acquisition",
      label: "Acquisition",
      specialty: "tu es expert acquisition : contenu, emailing, publicité, prospection",
      hook: "repère brièvement son canal d'acquisition le plus faible puis propose UNE action pour l'améliorer",
      leverKey: "ceo_vision",
    },
  },
];

export function resolvePageContext(pathname: string): PageAgentContext | null {
  return PAGE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))?.context ?? null;
}

export function getPageContextByKey(pageKey: string): PageAgentContext | null {
  return PAGE_RULES.find((rule) => rule.context.pageKey === pageKey)?.context ?? null;
}
