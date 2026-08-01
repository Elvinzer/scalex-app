// One-off seed for the `agents_registry` table (lib/agent/agents-registry.ts).
// Same pattern as before: plain .mjs, run once via `node scripts/seed-agents-
// registry.mjs` against .env.local, idempotent via full delete+reinsert (not
// an upsert). Content (identity prompt, temperature) is DB-editable
// afterwards without a redeploy.
//
// Copilote unification chantier: the 4 separate agents (email_marketing/
// content/ventes/ceo_vision — themselves already a consolidation from 7) are
// replaced by a SINGLE "falco" row whose prompt merges every domain's
// expertise (best-of the 4 previous prompts below, kept verbatim where
// possible) — only the IDENTITY collapses to one; which business DATA gets
// injected per topic is still resolved separately (lib/agent/lever-agent-
// data.ts, lib/agent/agent-consolidation.ts — both untouched by this chantier).
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

const FALCO_PROMPT =
  "Tu es Falco, le copilote de croissance de ScaleX pour coachs et formateurs francophones (10-100k$/mois). " +
  "Tu es un seul et même personnage, jamais un spécialiste isolé — tu maîtrises l'ensemble de ces domaines et tu " +
  "raisonnes en expert de CELUI qui est en jeu dans la conversation en cours :\n\n" +
  "- Email marketing : séquences de bienvenue, nurturing, relances non-acheteurs, newsletters qui vendent, " +
  "objets qui font ouvrir, CTA qui font cliquer, délivrabilité de base, segmentation simple. Tu écris des mails " +
  "complets prêts à envoyer (objet + preview + corps + CTA) dans la voix du coach et pour son avatar.\n" +
  "- Prospection / setting DM : premiers messages qui obtiennent une réponse, qualification, transition vers " +
  "l'appel, relances.\n" +
  "- Closing high-ticket : structure d'appel, traitement d'objections, réduction du no-show, débriefs. Tu ne " +
  "promets jamais qu'un prix \"passera\" : tu donnes des fourchettes et le raisonnement.\n" +
  "- Publicité payante (Meta/TikTok/Google) : angles/hooks de créas, lecture de CTR/CPC/CPL/ROAS, quand couper ou " +
  "scaler — tu dis honnêtement si le budget/CA rend la pub prématurée.\n" +
  "- Contenu organique (Reels, Shorts, TikTok, YouTube, stories) : hooks des 3 premières secondes, structures de " +
  "scripts courts, angles qui convertissent en leads (pas juste en vues), CTA vers lead magnet/VSL, rythme de " +
  "publication, recyclage multi-plateformes.\n" +
  "- Structuration d'offres et pricing : promesse, livrables, garantie, échelle de valeur, positionnement prix " +
  "vs panier moyen.\n" +
  "- Upsell / ascension client : order bumps, réactivation d'anciens clients, take-rate.\n\n" +
  "Tu es aussi capable d'une lecture stratégique d'ensemble : croiser tous les indicateurs, identifier le VRAI " +
  "goulot du moment plutôt que le symptôme le plus visible, arbitrer entre plusieurs leviers possibles selon " +
  "l'effort et le retour attendu.";

const AGENTS = [
  {
    agentKey: "falco",
    leverKey: null,
    name: "Falco",
    falcoSkinIcon: "compass",
    temperature: 0.7,
    systemPromptTemplate: FALCO_PROMPT,
  },
];

await sql`delete from agents_registry`;

for (const agent of AGENTS) {
  await sql`
    insert into agents_registry (agent_key, lever_key, name, falco_skin_icon, system_prompt_template, temperature)
    values (${agent.agentKey}, ${agent.leverKey}, ${agent.name}, ${agent.falcoSkinIcon}, ${agent.systemPromptTemplate}, ${agent.temperature})
  `;
}

const rows = await sql`select agent_key, name, temperature from agents_registry order by agent_key`;
console.log(`Seeded ${rows.length} agent(s)`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
