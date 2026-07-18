import type { StageKnowledge } from "./types";

// closingRate — l'appel a bien lieu mais ne se transforme pas en vente.
export const closingRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "sales_script",
      text: "Tu utilises un script de vente structuré pendant l'appel ?",
      options: [
        { id: "always", label: "Oui, toujours" },
        { id: "sometimes", label: "Parfois" },
        { id: "never", label: "Non, je improvise selon l'échange" },
      ],
    },
    {
      id: "budget_qualified",
      text: "Le budget du prospect est qualifié avant l'appel ?",
      options: [
        { id: "yes", label: "Oui, en amont" },
        { id: "no", label: "Non, ça se découvre pendant l'appel" },
      ],
    },
  ],
  rules: [
    {
      id: "no-structure",
      when: (answers) => answers.sales_script === "never",
      cause: "L'absence de structure dans l'appel laisse la conversation dériver sans aller jusqu'au closing",
      guidance:
        "Mets en place un script de vente structuré (qualification, présentation de l'offre, traitement des objections, demande de closing explicite) — même en improvisant le ton, garde ces étapes fixes.",
    },
    {
      id: "budget-not-qualified",
      when: (answers) => answers.budget_qualified === "no",
      cause: "Le budget non qualifié en amont peut faire échouer l'appel sur un désaccord de prix découvert trop tard",
      guidance:
        "Qualifie le budget dans le questionnaire pré-appel ou dès les premières minutes, pour ne pas présenter une offre hors budget en fin d'appel.",
    },
  ],
};
