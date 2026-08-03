// One-off seed for the `lever_starter_plans` table (lib/levers/starter-plan.ts).
// Same pattern as scripts/seed-levers-catalog.mjs: plain .mjs, run once via
// `node scripts/seed-lever-starter-plans.mjs` against .env.local, idempotent
// via full delete+reinsert (not an upsert). Content is DB-editable
// afterwards without a redeploy — this is just the initial seed.
//
// All 20 catalog levers now have a plan (originally only the "Démarrer un
// levier" chantier's pilot set of 6 — email_marketing/ads/upsell_ascension/
// vsl/lead_magnet/webinar — did; the remaining 14 were filled in
// afterwards, same 3-4 step style). /demarrer/[leverKey] shows an honest
// empty state if a future lever is added here without a plan yet.
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

const step = (order, title, detail, estTime) => ({ order, title, detail, estTime });

const PLANS = [
  {
    leverKey: "email_marketing",
    steps: [
      step(1, "Choisir un outil d'emailing", "Mailerlite, ConvertKit ou Brevo sont de bons choix pour démarrer — gratuits ou pas chers jusqu'à quelques milliers de contacts.", "30 min"),
      step(2, "Définir ta séquence de bienvenue (Falco peut la rédiger avec toi)", "3 à 5 emails automatiques envoyés dans les jours suivant l'inscription : qui tu es, la transformation que tu proposes, un cas client, ton offre.", "2-3h"),
      step(3, "Faire ton premier envoi", "Envoie un email à ta liste actuelle, même petite — c'est en envoyant que tu apprends ce qui marche.", "30 min"),
      step(4, "Saisir tes premiers chiffres (envois, ouvertures, clics)", "Renseigne-les dans Mail pour que Falco puisse suivre ta progression.", "5 min"),
    ],
  },
  {
    leverKey: "ads",
    steps: [
      step(1, "Définir l'offre et le budget test", "Choisis UNE offre à promouvoir et un budget test modeste (10-20€/jour) que tu es prêt à \"perdre\" pour apprendre.", "30 min"),
      step(2, "Créer ta première campagne", "Un seul canal pour commencer (Meta est le plus accessible), un seul angle créatif à tester.", "1-2h"),
      step(3, "Saisir tes premiers chiffres", "Renseigne dépenses, leads et résultats dans Ads pour suivre ton coût par lead réel.", "5 min"),
    ],
  },
  {
    leverKey: "upsell_ascension",
    steps: [
      step(1, "Choisir l'offre support (celle que tu vends déjà)", "L'upsell se propose après cette vente — identifie ton offre principale actuelle.", "5 min"),
      step(2, "Définir l'offre complémentaire dans Produits", "Un programme VIP, un accompagnement plus poussé, ou un module en plus — quelque chose de cohérent avec l'offre principale.", "1h"),
      step(3, "Préparer ton script de proposition (Falco peut le rédiger avec toi)", "Quelques phrases pour proposer l'upsell juste après la vente, sans être insistant.", "30 min"),
      step(4, "Faire ta première vente avec upsell", "Propose-la à ton prochain client et coche \"Upsell pris ?\" dans Suivi des ventes.", null),
    ],
  },
  {
    leverKey: "vsl",
    steps: [
      step(1, "Écrire le script (Falco peut t'aider)", "Structure : ton histoire, la méthode/mécanisme unique que tu proposes, une preuve sociale, l'appel à l'action.", "2-3h"),
      step(2, "Tourner la vidéo", "Une caméra de téléphone et un bon micro suffisent pour commencer — le contenu compte plus que la production.", "1-2h"),
      step(3, "Monter et héberger la vidéo", "Un montage simple (coupes, sous-titres) puis hébergement sur YouTube (non-listé) ou Vimeo.", "2-3h"),
      step(4, "Intégrer la VSL à ton funnel", "Place-la avant la prise de rendez-vous ou en page de vente, avec un CTA clair après le visionnage.", "1h"),
    ],
  },
  {
    leverKey: "lead_magnet",
    steps: [
      step(1, "Choisir le format et le sujet", "Une checklist, un PDF ou une mini-formation qui répond à UNE douleur précise de ton avatar.", "30 min"),
      step(2, "Créer le contenu et la page d'opt-in", "Le contenu doit se consommer en moins de 15 minutes et donner un premier résultat concret.", "2-4h"),
      step(3, "Connecter à ton emailing et publier", "Relie la page à ton outil d'emailing pour capter automatiquement les inscriptions.", "30 min"),
    ],
  },
  {
    leverKey: "webinar",
    steps: [
      step(1, "Définir la promesse et le sujet", "Une promesse de résultat précise, assez forte pour donner envie de s'inscrire.", "30 min"),
      step(2, "Construire le plan de la session", "Un enseignement qui donne un vrai résultat, puis une transition naturelle vers ton offre.", "2-3h"),
      step(3, "Préparer l'offre de fin de session (Falco peut t'aider)", "Présente-la avec un deadline ou un bonus limité dans le temps pour créer une décision.", "1h"),
      step(4, "Planifier et promouvoir la session", "Choisis une date, ouvre les inscriptions, et relance tes inscrits la veille.", "1h"),
    ],
  },
  {
    leverKey: "newsletter",
    steps: [
      step(1, "Choisir une cadence tenable", "Hebdomadaire est plus facile à tenir dans la durée que bihebdomadaire — mieux vaut une cadence basse mais régulière.", "15 min"),
      step(2, "Définir un format simple et répétable", "Une idée ou une observation par email, pas un article complet — plus facile à écrire chaque semaine sans te bloquer.", "30 min"),
      step(3, "Écrire et envoyer les 3 premiers numéros", "L'objectif est de prendre le rythme, pas d'être parfait dès le premier envoi.", "1-2h"),
    ],
  },
  {
    leverKey: "seo_blog",
    steps: [
      step(1, "Identifier 5-10 questions que se posent tes prospects", "Ce que tu entends le plus souvent en appel de découverte ou dans tes messages est souvent la meilleure source.", "1h"),
      step(2, "Choisir ton premier sujet et vérifier qu'il est cherché", "Un outil gratuit comme Google Keyword Planner ou même les suggestions automatiques de la barre de recherche Google suffisent pour démarrer.", "30 min"),
      step(3, "Écrire et publier ton premier article", "Réponds à la question dès le premier paragraphe, puis développe — c'est aussi ce que préfèrent les moteurs de recherche.", "3-4h"),
      step(4, "Publier un article par mois, en continu", "Le SEO récompense la régularité sur la durée plus qu'un gros pic ponctuel.", null),
    ],
  },
  {
    leverKey: "podcast",
    steps: [
      step(1, "Définir le format et la fréquence", "Solo, interview, ou les deux — choisis quelque chose que tu peux tenir sur la durée sans t'épuiser.", "30 min"),
      step(2, "S'équiper au minimum", "Un micro correct et un logiciel d'enregistrement gratuit suffisent pour démarrer — pas besoin d'un studio.", "1h"),
      step(3, "Enregistrer et publier les 3 premiers épisodes", "Distribue-les sur Spotify/Apple Podcasts via un hébergeur comme Acast ou Buzzsprout.", "3-5h par épisode"),
      step(4, "Découper des extraits pour les réseaux sociaux", "Un bon moment de l'épisode republié en vidéo courte peut ramener de nouveaux auditeurs.", "1h"),
    ],
  },
  {
    leverKey: "retargeting",
    steps: [
      step(1, "Installer le pixel de tracking (Meta ou Google)", "À placer sur ta page de vente et ton site — c'est ce qui permet de créer l'audience à recibler ensuite.", "30 min"),
      step(2, "Créer une audience de retargeting", "Les visiteurs des 30 derniers jours qui n'ont pas acheté est un bon point de départ.", "15 min"),
      step(3, "Lancer une première campagne à petit budget", "5-10€/jour suffisent pour commencer à re-toucher cette audience tiède.", "30 min"),
      step(4, "Suivre le coût par résultat après quelques jours", "Compare-le à tes campagnes d'acquisition à froid — le retargeting doit normalement mieux performer.", null),
    ],
  },
  {
    leverKey: "referral",
    steps: [
      step(1, "Définir le moment où tu demandes", "Juste après un résultat client ou un témoignage positif est le moment où la recommandation est la plus naturelle.", "15 min"),
      step(2, "Préparer une phrase simple à réutiliser", "Une demande directe et courte fonctionne mieux qu'un argumentaire — Falco peut t'aider à la formuler.", "15 min"),
      step(3, "Décider d'une contrepartie (optionnelle)", "Une remise, un bonus ou un accès offert au client qui recommande peut augmenter le nombre de recommandations.", "15 min"),
      step(4, "Commencer à demander systématiquement", "Intègre la question à ta routine de suivi client plutôt que d'y penser au cas par cas.", null),
    ],
  },
  {
    leverKey: "sequence_relance_non_acheteurs",
    steps: [
      step(1, "Lister les objections les plus fréquentes", "Celles que tu entends le plus souvent en appel ou dans les messages des prospects hésitants.", "30 min"),
      step(2, "Rédiger la séquence (Falco peut t'aider)", "3 à 5 emails, chacun traitant une objection différente, envoyés sur 5-7 jours après le premier contact.", "1-2h"),
      step(3, "Automatiser l'envoi", "Déclenche-la automatiquement après un appel non conclu ou une visite de page de vente sans achat.", "30 min"),
      step(4, "Suivre les ventes récupérées grâce à la relance", "Note-les dans Suivi des ventes pour voir l'impact réel de la séquence.", null),
    ],
  },
  {
    leverKey: "order_bump",
    steps: [
      step(1, "Choisir un complément à petit prix", "Quelque chose de facile à consommer et clairement lié à l'offre principale — un bonus, un template, un guide.", "20 min"),
      step(2, "Écrire une phrase de bénéfice claire", "Une case à cocher se décide en 2 secondes — le bénéfice doit être immédiatement compris.", "15 min"),
      step(3, "L'ajouter sur ta page de paiement", "La plupart des outils de vente (Stripe Checkout, Systeme.io, ThriveCart...) permettent d'ajouter un order bump directement.", "30 min"),
    ],
  },
  {
    leverKey: "downsell",
    steps: [
      step(1, "Repérer les refus liés au prix ou à l'engagement", "Ce sont ceux-là qui sont les meilleurs candidats à un downsell.", "15 min"),
      step(2, "Définir une version allégée de ton offre", "Moins de modules, moins d'accompagnement ou un engagement plus court — à un prix nettement inférieur.", "1h"),
      step(3, "Préparer la phrase de transition (Falco peut t'aider)", "Elle se propose juste après le refus, sans donner l'impression de brader ton offre principale.", "30 min"),
      step(4, "Tester sur ton prochain refus", "Note le résultat dans Suivi des ventes pour voir si ça convertit.", null),
    ],
  },
  {
    leverKey: "garantie",
    steps: [
      step(1, "Choisir le type de garantie", "Remboursement simple, garantie de résultat conditionnée, ou période d'essai — selon ce que tu es à l'aise d'assumer.", "20 min"),
      step(2, "Formuler la phrase exacte (Falco peut t'aider)", "Elle doit être précise et sans ambiguïté — une garantie floue rassure moins qu'elle n'inquiète.", "20 min"),
      step(3, "L'afficher sur ta page de vente et la répéter en appel", "Une garantie qui n'est vue qu'une fois perd une grande partie de son effet rassurant.", "20 min"),
    ],
  },
  {
    leverKey: "preuve_sociale_page",
    steps: [
      step(1, "Rassembler tes témoignages existants", "Messages clients, avis, résultats partagés spontanément — tu en as probablement déjà plus que tu ne le penses.", "30 min"),
      step(2, "En demander 2-3 nouveaux si tu en manques", "Demande un résultat précis, pas un avis général — \"qu'est-ce qui a changé concrètement ?\"", "30 min"),
      step(3, "Les intégrer à ta page de vente", "Positionne-les juste avant les moments clés de décision — après la présentation de l'offre, avant le bouton d'achat.", "30 min"),
    ],
  },
  {
    leverKey: "onboarding_structure",
    steps: [
      step(1, "Lister les questions que posent tes nouveaux clients", "Ce sont elles qui révèlent ce qui manque dans ton onboarding actuel.", "30 min"),
      step(2, "Écrire le message de bienvenue (Falco peut t'aider)", "Accès aux ressources, attentes claires, premier pas à faire dans les 48h.", "1h"),
      step(3, "Centraliser les accès", "Un seul endroit (email, espace membre) plutôt que des liens éparpillés que le client doit retrouver lui-même.", "1-2h"),
      step(4, "Définir la première action à forte valeur", "Quelque chose de simple qui donne un résultat rapide dans les premiers jours.", "30 min"),
    ],
  },
  {
    leverKey: "collecte_temoignages_systematique",
    steps: [
      step(1, "Choisir le(s) moment(s) de la demande", "Fin d'accompagnement, ou quelques semaines après un résultat visible, sont les moments les plus naturels.", "15 min"),
      step(2, "Préparer 2-3 questions guidées", "Elles donnent des réponses bien plus exploitables qu'une demande ouverte — Falco peut t'aider à les formuler.", "30 min"),
      step(3, "Automatiser l'envoi de la demande", "Un email ou un message programmé au bon moment, plutôt que d'y penser au cas par cas.", "30 min"),
      step(4, "Centraliser les témoignages reçus", "Un seul dossier ou une seule page pour les retrouver facilement au moment de construire une page de vente.", null),
    ],
  },
  {
    leverKey: "communaute_clients",
    steps: [
      step(1, "Choisir la plateforme", "Facebook, Skool ou Discord selon les habitudes de ton audience — pas besoin d'un outil complexe pour démarrer.", "30 min"),
      step(2, "Définir 3-5 règles simples", "Elles cadrent les échanges sans les rendre rigides — bienveillance, pas de promo externe, etc.", "20 min"),
      step(3, "Lancer avec un premier sujet ou une présentation", "Donne le ton et invite chaque membre à se présenter pour créer les premiers échanges.", "30 min"),
      step(4, "Maintenir une présence régulière au départ", "Une communauté a besoin d'animation active dans les premières semaines avant de s'auto-entretenir.", null),
    ],
  },
  {
    leverKey: "reactivation_anciens_clients",
    steps: [
      step(1, "Lister tes anciens clients inactifs", "Ceux qui n'ont pas racheté ou qui ne sont plus en contact depuis plusieurs mois.", "30 min"),
      step(2, "Définir ce que tu as de nouveau à leur proposer", "Une offre suite, une mise à jour, ou simplement l'envie sincère de prendre des nouvelles.", "30 min"),
      step(3, "Envoyer un message personnel, pas un email de masse", "Un message qui montre que tu te souviens d'eux convertit bien mieux qu'une relance générique.", "1h"),
      step(4, "Suivre les ventes récupérées", "Note-les dans Suivi des ventes pour mesurer l'impact réel de la réactivation.", null),
    ],
  },
];

await sql`delete from lever_starter_plans`;

for (const plan of PLANS) {
  await sql`
    insert into lever_starter_plans (lever_key, steps)
    values (${plan.leverKey}, ${sql.json(plan.steps)})
  `;
}

const rows = await sql`select lever_key from lever_starter_plans order by lever_key`;
console.log(`Seeded ${rows.length} starter plans`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
