// One-off seed for the `lever_starter_plans` table (lib/levers/starter-plan.ts).
// Same pattern as scripts/seed-levers-catalog.mjs: plain .mjs, run once via
// `node scripts/seed-lever-starter-plans.mjs` against .env.local, idempotent
// via full delete+reinsert (not an upsert). Content is DB-editable
// afterwards without a redeploy — this is just the initial seed.
//
// Only the "Démarrer un levier" chantier's pilot set of 6 levers has a plan
// today (email_marketing/ads/upsell_ascension already existed; vsl/
// lead_magnet/webinar are new here) — /demarrer/[leverKey] shows an honest
// empty state for every other catalog lever rather than a fabricated plan.
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
