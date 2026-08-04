// One-off seed for the `levers_catalog` table (lib/levers/catalog.ts). Same
// pattern as scripts/seed-benchmarks.mjs: plain .mjs (no ts-node/tsx runner
// configured), run once via `node scripts/seed-levers-catalog.mjs` against
// .env.local, idempotent via full delete+reinsert (not an upsert).
//
// formulaType/formulaParams only set where the brief gave a concrete
// formula example (email_marketing, upsell_ascension) — every other lever
// is "none" ("Impact : à évaluer"), per the explicit "jamais un chiffre
// inventé" rule rather than guessing a formula the brief didn't specify.
//
// readsFromProfile levers (vsl, sequence_relance_non_acheteurs,
// upsell_ascension, onboarding_structure) get `questions: []` — resolved
// from business_profile instead, see lib/levers/catalog.ts's
// resolveFromBusinessProfile. order_bump and downsell are seeded as two
// separate rows (the brief's own "8/19" example implies 19 total levers,
// which only adds up if these are split rather than one combined lever).
//
// explanation/estTimeLabel are now curated for all 20 levers in this
// catalog (originally only the "Démarrer un levier" chantier's pilot set of
// 6 — lead_magnet, email_marketing, ads, vsl, webinar, upsell_ascension —
// had them; the remaining 14 were filled in afterwards, same 3-paragraph
// style: what it is / why it pays for a coach / what it looks like
// concretely). A lever with explanation: null renders as "section masquée"
// on /demarrer/[leverKey], not a placeholder — keep that fallback in mind
// if a future lever is added without curated copy yet.
import postgres from "postgres";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sql = postgres(env.DATABASE_URL, { prepare: false });

const yesNo = (key, prompt) => ({ key, prompt, kind: "yes_no_notyet" });
const stat = (key, prompt, unit) => ({ key, prompt, kind: "stat_number", ...(unit ? { unit } : {}) });
const text = (key, prompt) => ({ key, prompt, kind: "stat_text" });
const select = (key, prompt, options) => ({ key, prompt, kind: "select", options });

const LEVERS = [
  // --- ACQUISITION ---
  {
    leverKey: "lead_magnet",
    label: "Lead magnet",
    category: "acquisition",
    questions: [
      yesNo("hasLeadMagnet", "Tu proposes un lead magnet (PDF, formation gratuite…) ?"),
      text("type", "Quel type de lead magnet ?"),
      stat("optinRate", "Taux d'opt-in sur ta page dédiée, à peu près ?", "%"),
    ],
    benchmarkValue: 0.3,
    benchmarkStatKey: "optinRate",
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 1,
    explanation:
      "Un lead magnet, c'est une ressource gratuite (PDF, mini-formation, checklist, audit...) que tu échanges contre l'email d'un prospect. C'est la porte d'entrée de ton funnel : quelqu'un qui télécharge ton lead magnet devient un contact que tu peux relancer, nourrir et convertir, au lieu d'un visiteur qui repart sans laisser de trace.\n\nÇa transforme du trafic froid (réseaux sociaux, SEO, pub) en liste email que tu contrôles. Un bon lead magnet répond à UNE douleur précise de ton avatar, se consomme en moins de 15 minutes, et pointe naturellement vers ton offre.\n\nDans la pratique, ça donne une checklist \"5 erreurs qui bloquent tes clients\", ou un audit express de leur situation actuelle : un premier résultat rapide qui donne envie d'aller plus loin avec toi.",
    estTimeLabel: "2-4h",
  },
  {
    leverKey: "email_marketing",
    label: "Email marketing",
    category: "acquisition",
    questions: [
      yesNo("hasEmailMarketing", "Tu envoies des emails à ta liste ?"),
      stat("listSize", "Taille de ta liste ?"),
      stat("frequencyPerWeek", "Fréquence d'envoi par semaine ?"),
      stat("openRate", "Taux d'ouverture, à peu près ?", "%"),
      stat("ctr", "Taux de clic, à peu près ?", "%"),
      stat("revenueAttributed", "CA attribué à l'emailing par mois, à peu près ?", "€"),
    ],
    benchmarkValue: 0.35,
    benchmarkStatKey: "openRate",
    formulaType: "leads_x_rate_x_closing_x_price",
    formulaParams: { rate: 0.025 },
    effort: "moyen",
    sortOrder: 2,
    explanation:
      "L'emailing, c'est la relation continue avec ta liste : une séquence de bienvenue quand quelqu'un s'inscrit, puis des envois réguliers qui informent, engagent et vendent. C'est le canal le moins cher et le plus rentable une fois en place, parce que tu ne repayes jamais pour reparler à quelqu'un qui t'a déjà donné son email.\n\nLa majorité des gens n'achètent pas au premier contact. L'email est ce qui les garde chauds jusqu'à ce qu'ils soient prêts, et une séquence de bienvenue bien faite peut à elle seule générer des ventes en pilote automatique.\n\nConcrètement : 3 à 5 emails automatiques envoyés dans les jours suivant l'inscription (qui es-tu, quelle transformation tu proposes, un cas client, une offre), puis des envois hebdomadaires ou bihebdomadaires avec du contenu utile et des rappels de ton offre.",
    estTimeLabel: "3-5h pour la séquence de bienvenue",
  },
  {
    leverKey: "newsletter",
    label: "Newsletter",
    category: "acquisition",
    questions: [
      yesNo("hasNewsletter", "Cadence régulière de newsletter (distincte des séquences) ?"),
      stat("openRate", "Taux d'ouverture, à peu près ?", "%"),
      stat("ctr", "Taux de clic, à peu près ?", "%"),
    ],
    // Benchmark sur le clic (pas l'ouverture) — le clic reflète mieux
    // l'intérêt réel de l'audience pour le contenu (voir
    // lib/levers/benchmark-info.ts).
    benchmarkValue: 0.03,
    benchmarkStatKey: "ctr",
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
    explanation:
      "La newsletter, c'est un envoi récurrent (hebdomadaire ou bihebdomadaire) qui n'a pas la structure automatisée d'une séquence de bienvenue, mais qui maintient le lien avec ta liste dans la durée : ce que tu apprends, ce que tu observes chez tes clients, un point de vue sur ton domaine. Elle vit en dehors de l'entonnoir automatique, c'est la conversation de fond que tu entretiens avec les gens qui te suivent.\n\nÇa garde ta liste chaude entre deux offres. Sans elle, les gens t'oublient au bout de quelques semaines et ton taux d'ouverture s'effondre au moment où tu as vraiment besoin d'eux (un lancement, une promo). Une newsletter régulière, c'est ce qui fait qu'un email de vente, plus tard, arrive à quelqu'un qui te lit encore.\n\nConcrètement : un envoi hebdomadaire court (une idée, une observation, un lien vers du contenu), avec occasionnellement un rappel discret de ton offre. Pas besoin que chaque email vende, l'objectif est de rester présent.",
    estTimeLabel: "1-2h par semaine, en continu",
  },
  {
    leverKey: "seo_blog",
    label: "Blog / SEO",
    category: "acquisition",
    questions: [yesNo("hasSeoBlog", "Tu as un blog / du contenu SEO ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "eleve",
    sortOrder: 4,
    explanation:
      "Le blog / SEO, c'est du contenu écrit publié sur ton propre site, structuré pour répondre aux questions que tapent tes prospects dans Google, et pour être trouvé par eux des mois, voire des années après sa publication.\n\nC'est le seul canal d'acquisition qui continue de t'apporter du trafic sans effort une fois l'article publié. Contrairement aux réseaux sociaux, où un post disparaît en 48h, un article bien positionné capte du trafic en continu, et c'est aussi un bon moyen de démontrer ton expertise à quelqu'un qui ne te connaît pas encore.\n\nConcrètement : un article qui répond précisément à UNE question que se pose ton avatar (\"comment faire X quand on est Y\"), optimisé pour ce mot-clé, avec un lien clair vers ton lead magnet ou ton offre à la fin.",
    estTimeLabel: "3-6 mois avant les premiers résultats organiques",
  },
  {
    leverKey: "podcast",
    label: "Podcast",
    category: "acquisition",
    questions: [
      yesNo("hasPodcast", "Tu as un podcast ?"),
      stat("frequencyPerMonth", "Fréquence par mois ?"),
    ],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "eleve",
    sortOrder: 5,
    explanation:
      "Le podcast, c'est un format audio régulier (solo ou en interview) qui te permet de développer tes idées en profondeur et de construire une relation de proximité avec ton audience, sur un temps d'écoute bien plus long qu'un post ou une vidéo courte.\n\nLe format long crée une confiance difficile à obtenir ailleurs. Quelqu'un qui t'écoute 30-40 minutes en marchant ou en voiture développe une familiarité proche de celle qu'il aurait avec un ami, et le format se prête bien aux interviews de clients ou d'experts, ce qui élargit ton audience via leur réseau.\n\nConcrètement : un épisode régulier (hebdomadaire ou bihebdomadaire), un format clair (solo, interview, ou les deux en alternance), publié sur les plateformes d'écoute et relayé en clips courts sur les réseaux.",
    estTimeLabel: "3-5h par épisode (préparation + enregistrement + montage)",
  },
  {
    leverKey: "retargeting",
    label: "Retargeting",
    category: "acquisition",
    questions: [yesNo("hasRetargeting", "Tu fais du retargeting sur tes visiteurs/viewers ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 6,
    explanation:
      "Le retargeting, c'est afficher de la publicité ciblée aux gens qui ont déjà visité ton site, ta page de vente, ou regardé une de tes vidéos, sans avoir converti. C'est de la publicité adressée à une audience \"tiède\", pas à des inconnus.\n\nLa majorité des visiteurs ne convertissent jamais au premier passage, et le retargeting est souvent le canal publicitaire avec le meilleur retour : tu ne payes que pour re-toucher des gens qui ont déjà montré un intérêt réel, à un coût par résultat généralement bien plus bas qu'une campagne d'acquisition à froid.\n\nConcrètement : un pixel installé sur ta page de vente ou ton site, une audience créée à partir des visiteurs des 30 derniers jours, et une pub qui rappelle ton offre ou traite une objection courante, sur un petit budget, souvent quelques euros par jour.",
    estTimeLabel: "1-2h pour la mise en place",
  },
  {
    leverKey: "referral",
    label: "Parrainage",
    category: "acquisition",
    questions: [yesNo("hasReferral", "Tes clients peuvent-ils te recommander (parrainage) ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 7,
    explanation:
      "Le parrainage, c'est un système qui encourage tes clients actuels à te recommander, avec ou sans récompense en échange (accès à un bonus, remise sur un renouvellement, etc.). C'est transformer la satisfaction client en canal d'acquisition actif plutôt que de compter sur le bouche-à-oreille spontané.\n\nUn lead qui arrive recommandé par quelqu'un qu'il connaît a déjà une confiance de départ qu'aucune publicité ne peut acheter. Le taux de conversion sur ce type de lead est généralement bien plus élevé, et le coût d'acquisition proche de zéro.\n\nConcrètement : une demande simple et directe (\"connais-tu quelqu'un que ça pourrait aider ?\") posée au bon moment, juste après un résultat obtenu ou un témoignage, éventuellement accompagnée d'un petit geste pour le client qui recommande.",
    estTimeLabel: "30 min pour mettre le process en place",
  },
  {
    leverKey: "ads",
    label: "Publicité (Ads)",
    category: "acquisition",
    questions: [
      yesNo("hasAds", "Tu fais de la publicité payante (Meta, Google, TikTok, LinkedIn) ?"),
      // Only the 5 channels present in AD_CHANNEL_BENCHMARKS (lib/levers/opportunities.ts)
      // get a cost-per-result comparison; the others fall back to the generic
      // effort-based estimate (no invented CPA). Prompt says "publicitaire" so
      // the question stays self-explanatory once the yes/no context is gone.
      select("channel", "Canal publicitaire principal", [
        "Meta — génération de leads",
        "Meta — ecommerce",
        "Meta — trafic / notoriété",
        "Google Search",
        "YouTube Ads",
        "TikTok — génération de leads",
        "TikTok — ecommerce",
        "LinkedIn — B2B",
      ]),
      stat("monthlySpend", "Budget pub mensuel, à peu près ?", "€"),
      stat("monthlyResults", "Leads ou clients générés par mois, à peu près ?"),
    ],
    // Pas de comparaison générique "leads_x_rate..." — le coût par résultat
    // benchmark dépend du canal choisi, calculé à part (voir
    // AD_CHANNEL_BENCHMARKS dans lib/levers/opportunities.ts). Le cas ABSENT
    // (pas encore de canal choisi) utilise sa propre formule budget-de-test,
    // voir estimateAdsAbsent — testBudgetPerDayEur/defaultCpaEur sont des
    // hypothèses prudentes, pas le vrai coût par lead d'un canal réel (inconnu
    // tant qu'aucune campagne n'existe). revenueThresholdEur/
    // dampeningBelowThreshold reprennent le même seuil que la règle
    // priority_rules "lever_revenue_gate" (3000€) — l'impact lui-même est
    // amorti en dessous, pas seulement son tri.
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "ads_test_budget_x_closing_x_price",
    formulaParams: {
      testBudgetPerDayEur: 10,
      defaultCpaEur: 30,
      revenueThresholdEur: 3000,
      dampeningBelowThreshold: 0.3,
      rangeVariance: 0.3,
    },
    effort: "moyen",
    sortOrder: 8,
    explanation:
      "La publicité payante, c'est acheter de la visibilité garantie sur Meta, Google, TikTok ou LinkedIn, au lieu de dépendre uniquement de l'algorithme organique. C'est un levier de VOLUME : une fois que ton funnel convertit bien, chaque euro dépensé devient un investissement prévisible plutôt qu'une dépense.\n\nÇa découple ta croissance du temps que tu passes à créer du contenu, tu peux scaler ton acquisition sans scaler tes heures. Mais c'est aussi le levier le plus risqué si ton closing n'est pas encore solide : payer pour des leads que tu ne sais pas convertir, c'est brûler du cash.\n\nConcrètement : un budget test modeste (quelques dizaines d'euros par jour) sur UN canal, une offre claire en bout de funnel, et un suivi serré du coût par lead pour savoir vite si ça marche ou s'il faut couper.",
    estTimeLabel: "1-2 semaines pour la première campagne",
  },

  // --- VENTE ---
  {
    leverKey: "vsl",
    label: "VSL",
    category: "vente",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    // Absent-case formula: uplift on top of the CURRENT booking volume
    // (settingTotals.callsBooked) — see estimateVslAbsent in
    // lib/levers/opportunities.ts. upliftMin/upliftMax IS the displayed
    // range (a VSL's real effect is inherently uncertain before it exists),
    // no separate variance param needed like ads.
    formulaType: "traffic_uplift_x_price",
    formulaParams: { upliftMin: 0.2, upliftMax: 0.4 },
    effort: "moyen",
    sortOrder: 1,
    explanation:
      "Une VSL (Video Sales Letter), c'est une vidéo de vente structurée, généralement 10 à 30 minutes, qui présente ton offre, traite les objections principales et amène à l'action, à la place (ou en complément) d'un appel de vente humain.\n\nElle travaille 24h/24 sans que tu sois derrière : elle peut pré-qualifier tes prospects avant même l'appel, ce qui augmente le taux de prise de rendez-vous ET la qualité des gens qui arrivent en appel (déjà convaincus, moins d'objections à traiter en live).\n\nConcrètement : une histoire (le problème que tu as toi-même vécu ou observé), la méthode ou le mécanisme unique que tu proposes, une preuve sociale, et un appel à l'action clair vers la prise de rendez-vous ou l'achat direct.",
    estTimeLabel: "1-2 semaines (script + tournage)",
  },
  {
    leverKey: "webinar",
    label: "Webinaire / masterclass",
    category: "vente",
    questions: [
      yesNo("hasWebinar", "Tu fais des webinaires/masterclass de vente ?"),
      stat("frequencyPerMonth", "Fréquence par mois ?"),
      stat("inscrits", "Nombre d'inscrits en moyenne ?"),
      stat("presents", "Nombre de présents en moyenne ?"),
      stat("showUpRate", "Taux de présence, à peu près ?", "%"),
      stat("ventes", "Ventes générées en moyenne par session ?"),
    ],
    // "Bon niveau" de présence live (50-60%) — sourced benchmark table,
    // see lib/levers/benchmark-info.ts. Previously 0.4, a rough guess.
    benchmarkValue: 0.5,
    benchmarkStatKey: "showUpRate",
    formulaType: "leads_x_rate_x_closing_x_price",
    // Clic CTA central (≈9%) from the sourced benchmark table — previously
    // 0.06, a rough guess undersellling this lever.
    formulaParams: { rate: 0.09 },
    effort: "moyen",
    sortOrder: 2,
    explanation:
      "Un webinaire, c'est une session live (ou semi-live) où tu enseignes quelque chose de concret à ton audience pendant 45-90 minutes, puis tu présentes ton offre à la fin. C'est un format qui combine contenu de valeur et vente en une seule session.\n\nLe format live crée un engagement et une urgence qu'un email ou un post ne peuvent pas reproduire. Les gens qui restent jusqu'au bout sont déjà investis, et le taux de conversion en vente y est généralement plus élevé qu'ailleurs dans le funnel.\n\nConcrètement : une promesse de résultat précise pour l'inscription, un enseignement qui donne un vrai résultat (pas juste une accroche), puis une offre présentée avec un deadline ou un bonus limité dans le temps pour créer une décision.",
    estTimeLabel: "1 semaine (préparation + présentation)",
  },
  {
    leverKey: "sequence_relance_non_acheteurs",
    label: "Relance non-acheteurs",
    category: "vente",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
    explanation:
      "La relance des non-acheteurs, c'est une séquence d'emails automatique envoyée à ceux qui ont montré un intérêt (opt-in, appel réservé, visite de la page de vente) mais qui n'ont pas acheté. Plutôt que de les laisser disparaître silencieusement, tu leur reparles avec un angle différent : une objection traitée, une preuve sociale, une urgence.\n\nUne bonne partie des ventes n'arrivent pas au premier contact. Beaucoup de prospects ont besoin d'un rappel ou d'un argument supplémentaire pour se décider, et sans cette relance, tu perds silencieusement des ventes que tu as déjà presque obtenues.\n\nConcrètement : 3 à 5 emails automatiques envoyés dans les jours suivant un appel non conclu ou une visite de page de vente sans achat, chacun traitant une objection différente (le prix, le temps, le doute sur les résultats), avec un rappel de deadline si ton offre en a une.",
    estTimeLabel: "2-3h pour la séquence",
  },
  {
    leverKey: "order_bump",
    label: "Order bump",
    category: "vente",
    questions: [yesNo("hasOrderBump", "Tu proposes une offre complémentaire au checkout ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 4,
    explanation:
      "L'order bump, c'est une offre complémentaire proposée au moment précis du paiement : une case à cocher sur la page de commande, avant même que le client ait finalisé son achat principal. C'est le point de vente le plus impulsif de tout ton funnel, la carte est déjà sortie, la décision d'achat déjà prise.\n\nC'est le moyen le plus simple d'augmenter ton panier moyen sans effort de vente supplémentaire. Pas de script, pas d'appel, juste une case à cocher, et le taux d'acceptation est souvent élevé parce que le montant proposé est faible par rapport à l'achat principal en cours.\n\nConcrètement : un complément à petit prix, directement lié à l'offre principale (un guide, un template, un module bonus), affiché sur la page de paiement avec un bénéfice clair en une phrase.",
    estTimeLabel: "1h pour le mettre en place",
  },
  {
    leverKey: "downsell",
    label: "Downsell",
    category: "vente",
    questions: [yesNo("hasDownsell", "Une alternative moins chère en cas de refus ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 5,
    explanation:
      "Le downsell, c'est une alternative moins chère (ou plus légère) que tu proposes à quelqu'un qui vient de refuser ton offre principale, au lieu de le laisser repartir les mains vides. C'est un filet de sécurité qui capte une partie des \"non\" qui ne sont pas des refus définitifs, juste des refus au prix ou au format actuel.\n\nBeaucoup de \"non\" sont en réalité des \"pas à ce prix\" ou \"pas avec cet engagement\". Un downsell bien pensé récupère une partie de ce chiffre d'affaires qui, sinon, part définitivement à zéro.\n\nConcrètement : une version allégée de ton offre (moins d'accompagnement, moins de modules, un engagement plus court) proposée juste après un refus, à un prix nettement inférieur, en appel de vente ou en automatique sur la page de paiement.",
    estTimeLabel: "1-2h pour définir l'offre",
  },
  {
    leverKey: "garantie",
    label: "Garantie",
    category: "vente",
    questions: [yesNo("hasGarantie", "Ton offre a-t-elle une garantie formulée ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 6,
    explanation:
      "La garantie, c'est un engagement formulé clairement sur ta page de vente ou pendant l'appel (remboursement, résultat garanti, période d'essai) qui réduit le risque perçu par le prospect au moment de la décision d'achat.\n\nL'objection numéro un à l'achat, souvent non-dite, c'est \"et si ça ne marche pas pour moi ?\". Une garantie claire retire une partie de ce risque de son côté et le transfère symboliquement vers toi, ce qui, pour beaucoup de prospects hésitants, suffit à faire basculer la décision.\n\nConcrètement : une phrase précise et sans ambiguïté (\"garanti 30 jours, satisfait ou remboursé\", ou une garantie de résultat conditionnée à des actions précises de ta part), affichée clairement sur la page de vente et répétée en appel.",
    estTimeLabel: "30 min pour la formuler",
  },
  {
    leverKey: "preuve_sociale_page",
    label: "Preuve sociale (page de vente)",
    category: "vente",
    questions: [yesNo("hasPreuveSociale", "Témoignages sur ta page de vente ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 7,
    explanation:
      "La preuve sociale sur la page de vente, c'est l'ensemble des témoignages, résultats chiffrés, avis ou logos qui montrent à un prospect que d'autres personnes comme lui ont déjà obtenu ce que tu promets — avant qu'il ait à te faire confiance sur parole.\n\nPour un coach, ça rapporte parce que personne n'aime être le premier à tester quelque chose : voir que d'autres ont déjà obtenu des résultats réduit fortement l'hésitation à l'achat, surtout pour une offre avec un prix ou un engagement conséquent.\n\nConcrètement : 3 à 5 témoignages précis (avec un résultat concret, pas juste \"super coach !\"), idéalement en vidéo ou avec une photo, positionnés juste avant les moments clés de décision sur la page (après la présentation de l'offre, avant le bouton d'achat).",
    estTimeLabel: "1-2h pour les rassembler et les intégrer",
  },

  // --- DÉLIVRABILITÉ ---
  {
    leverKey: "upsell_ascension",
    label: "Upsell / ascension",
    category: "delivrabilite",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "clients_x_takerate_x_price_fraction",
    formulaParams: { takeRate: 0.2, priceFraction: 0.3 },
    effort: "moyen",
    sortOrder: 1,
    explanation:
      "L'upsell, c'est proposer une offre complémentaire — plus complète, plus accompagnée, ou plus avancée — à quelqu'un qui vient déjà d'acheter (ou qui est déjà client). C'est le levier au meilleur rapport effort/gain : tu ne dépenses rien en acquisition, tu vends à quelqu'un qui te fait déjà confiance.\n\nPour un coach, ça rapporte parce qu'augmenter le panier moyen de tes clients existants coûte beaucoup moins cher que d'aller chercher un nouveau client — et le moment juste après un achat (ou une victoire client) est celui où la confiance est la plus haute.\n\nConcrètement : une offre d'ascension claire (un programme VIP, un accompagnement plus poussé, un module complémentaire) proposée au bon moment — juste après la vente principale, ou après un premier résultat obtenu.",
    estTimeLabel: "3-5h pour définir l'offre et le script",
  },
  {
    leverKey: "onboarding_structure",
    label: "Structure d'onboarding",
    category: "delivrabilite",
    questions: [],
    readsFromProfile: true,
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 2,
    explanation:
      "La structure d'onboarding, c'est le parcours que tu fais vivre à un client dans ses premiers jours après l'achat — accès aux ressources, premier appel ou message de bienvenue, attentes clarifiées. C'est ce qui détermine si un client démarre en confiance ou dans le flou.\n\nPour un coach, ça rapporte parce qu'un onboarding clair réduit drastiquement le risque de décrochage précoce et les demandes de remboursement dans les premiers jours — un client qui sait exactement quoi faire dès le départ s'engage plus vite, obtient des résultats plus vite, et devient plus facilement un témoignage ou un client qui reste.\n\nConcrètement : un message de bienvenue automatique dès l'achat, un accès centralisé aux ressources (pas éparpillé dans 5 outils différents), et une première action claire à faire dans les 48h pour créer un momentum immédiat.",
    estTimeLabel: "2-4h pour structurer le parcours",
  },
  {
    leverKey: "collecte_temoignages_systematique",
    label: "Collecte de témoignages",
    category: "delivrabilite",
    questions: [yesNo("hasCollecteTemoignages", "Tu as un process pour demander les témoignages ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "faible",
    sortOrder: 3,
    explanation:
      "La collecte systématique de témoignages, c'est un process répété — pas ponctuel — qui te permet de récupérer un retour client à chaque étape clé (fin de programme, résultat obtenu, renouvellement), plutôt que de compter sur les quelques clients qui pensent spontanément à t'en laisser un.\n\nPour un coach, ça rapporte parce que la preuve sociale est un des leviers de conversion les plus puissants, mais elle s'épuise vite si elle repose sur 2-3 témoignages recyclés partout. Un process systématique te garantit un flux continu de nouveaux témoignages à jour, alignés sur ton offre actuelle.\n\nConcrètement : une demande envoyée automatiquement à un moment précis (fin d'accompagnement, quelques semaines après un résultat obtenu), avec 2-3 questions guidées plutôt qu'un \"dis-moi ce que t'en as pensé\" trop ouvert, qui donne rarement une réponse exploitable.",
    estTimeLabel: "1h pour mettre le process en place",
  },
  {
    leverKey: "communaute_clients",
    label: "Communauté clients",
    category: "delivrabilite",
    questions: [yesNo("hasCommunaute", "Tes clients ont un espace communautaire ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 4,
    explanation:
      "La communauté clients, c'est un espace dédié (groupe privé, forum, serveur Discord/Slack) où tes clients peuvent échanger entre eux, poser des questions et s'entraider — en plus du contact direct avec toi.\n\nPour un coach, ça rapporte parce qu'une communauté active augmente la rétention et réduit ta charge de support individuel : les clients qui s'entraident restent engagés plus longtemps, et une partie des questions qui t'arriveraient normalement en message privé trouve sa réponse entre pairs. C'est aussi un espace où les résultats des uns motivent les autres.\n\nConcrètement : un groupe privé simple (Facebook, Skool, Discord), quelques règles de base, et une présence régulière de ta part au départ pour lancer les échanges — jusqu'à ce que la communauté s'auto-entretienne.",
    estTimeLabel: "1-2h de mise en place, puis présence régulière",
  },
  {
    leverKey: "reactivation_anciens_clients",
    label: "Réactivation d'anciens clients",
    category: "delivrabilite",
    questions: [yesNo("hasReactivation", "Tu recontactes tes anciens clients ?")],
    benchmarkValue: null,
    benchmarkStatKey: null,
    formulaType: "none",
    formulaParams: {},
    effort: "moyen",
    sortOrder: 5,
    explanation:
      "La réactivation d'anciens clients, c'est recontacter ceux qui ont déjà acheté — mais qui ne sont plus actifs ou n'ont pas racheté depuis un moment — pour leur proposer une nouvelle offre, un renouvellement, ou simplement reprendre le contact.\n\nPour un coach, ça rapporte parce que ce sont des gens qui te connaissent déjà, t'ont déjà payé, et n'ont besoin d'aucune reconquête de confiance de zéro — le coût d'acquisition est proche de zéro comparé à un nouveau prospect, et le taux de conversion y est généralement bien supérieur.\n\nConcrètement : un message direct et personnel (pas un email de masse générique) qui prend des nouvelles et propose une offre adaptée à où ils en sont maintenant — un accompagnement suite, une nouvelle offre sortie depuis, ou simplement une prise de nouvelles sincère.",
    estTimeLabel: "1-2h pour la première campagne de réactivation",
  },
];

await sql`delete from levers_catalog`;

for (const lever of LEVERS) {
  await sql`
    insert into levers_catalog
      (lever_key, label, category, questions, reads_from_profile, benchmark_value, benchmark_stat_key, formula_type, formula_params, effort, sort_order, explanation, est_time_label)
    values (
      ${lever.leverKey}, ${lever.label}, ${lever.category}, ${sql.json(lever.questions)},
      ${lever.readsFromProfile ?? false}, ${lever.benchmarkValue}, ${lever.benchmarkStatKey},
      ${lever.formulaType}, ${sql.json(lever.formulaParams)}, ${lever.effort}, ${lever.sortOrder},
      ${lever.explanation ?? null}, ${lever.estTimeLabel ?? null}
    )
  `;
}

const rows = await sql`select lever_key, category, sort_order from levers_catalog order by category, sort_order`;
console.log(`Seeded ${rows.length} levers`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
