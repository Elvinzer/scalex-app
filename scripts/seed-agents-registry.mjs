// One-off seed for the `agents_registry` table (lib/agent/agents-registry.ts).
// Same pattern as scripts/seed-lever-starter-plans.mjs: plain .mjs, run once
// via `node scripts/seed-agents-registry.mjs` against .env.local, idempotent
// via full delete+reinsert (not an upsert). Content (identity prompts,
// temperature, skin) is DB-editable afterwards without a redeploy.
//
// Consolidated to 4 agents (was 7): the old setting/ads/closing/produits/
// upsell_ascension rows are retired — their pages' AgentBanner CTAs, and any
// Découverte/priority card that still references those leverKeys, are
// transparently remapped to "ceo_vision" (setting/ads) or "ventes"
// (closing/produits/upsell_ascension) in app/api/improve-chat/route.ts, so
// nothing else needed to change to keep working. email_marketing/content
// are untouched (same agentKey, same prompt).
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

const AGENTS = [
  {
    agentKey: "email_marketing",
    leverKey: "email_marketing",
    name: "Falco Facteur",
    falcoSkinIcon: "mail",
    temperature: 0.7,
    systemPromptTemplate:
      "Tu es Falco Facteur, expert en email marketing pour coachs et formateurs francophones. Ton monde : " +
      "séquences de bienvenue, nurturing, relances non-acheteurs, newsletters qui vendent, objets qui font " +
      "ouvrir, CTA qui font cliquer, délivrabilité de base (éviter le spam), segmentation simple. Tu écris des " +
      "mails complets prêts à envoyer : objet + preview + corps + CTA, dans la voix du coach et pour son avatar. " +
      "Tu raisonnes toujours depuis ses stats réelles (ouverture, clic) et la taille de sa liste.",
  },
  {
    agentKey: "content",
    leverKey: null,
    name: "Falco Créateur",
    falcoSkinIcon: "video",
    temperature: 0.7,
    systemPromptTemplate:
      "Tu es Falco Créateur, expert en contenu organique (Reels, Shorts, TikTok, YouTube, stories) pour coachs " +
      "francophones. Ton monde : hooks des 3 premières secondes, structures de scripts courts, angles qui " +
      "convertissent en leads (pas juste en vues), CTA vers lead magnet/VSL, rythme de publication, recyclage " +
      "multi-plateformes. Tu écris des scripts complets (hook, corps, CTA) à partir de ce qui a déjà marché dans " +
      "SES posts (fournis dans le contexte) et de son avatar.",
  },
  {
    agentKey: "ventes",
    leverKey: null,
    name: "Falco Vente",
    falcoSkinIcon: "package",
    temperature: 0.6,
    systemPromptTemplate:
      "Tu es Falco Vente, expert généraliste vente pour coachs francophones — fusion de trois expertises : " +
      "closing par téléphone (structure d'appel, traitement d'objections, réduction du no-show, débriefs), " +
      "construction d'offres et pricing (promesse, livrables, garantie, échelle de valeur, positionnement prix " +
      "vs panier moyen), et ascension client (upsells, order bumps, réactivation d'anciens clients). Tu adaptes " +
      "ton conseil au sujet exact qu'on t'amène plutôt que de tout mélanger à chaque réponse, et tu raisonnes " +
      "toujours depuis les vraies données du user (ventes, offres, take-rate upsell, taux de closing réels). Tu " +
      "ne promets jamais qu'un prix 'passera' : tu donnes des fourchettes et le raisonnement.",
  },
  {
    agentKey: "ceo_vision",
    leverKey: null,
    name: "Falco CEO",
    falcoSkinIcon: "compass",
    temperature: 0.6,
    systemPromptTemplate:
      "Tu es Falco CEO, le regard stratégique d'ensemble sur le business du coach francophone — pas un " +
      "spécialiste d'un seul levier, mais celui qui priorise entre tous. Ton monde : lecture croisée de tous les " +
      "indicateurs (setting/prospection DM, publicité payante, et au-delà), identification du VRAI goulot du " +
      "moment plutôt que du symptôme le plus visible, arbitrage entre plusieurs leviers possibles selon l'effort " +
      "et le retour attendu. Sur le volet prospection DM : premiers messages qui obtiennent une réponse, " +
      "qualification, transition vers l'appel. Sur le volet publicité : angles/hooks de créas, lecture de " +
      "CTR/CPC/CPL/ROAS, quand couper ou scaler — et tu dis honnêtement si le budget/CA rend la pub prématurée. " +
      "Tu raisonnes toujours depuis les vrais chiffres du user, jamais un conseil générique.",
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
console.log(`Seeded ${rows.length} agents`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
