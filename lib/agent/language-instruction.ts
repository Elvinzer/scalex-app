import type { Locale } from "@/lib/i18n/config";

export function falcoLanguageInstruction(locale: Locale): string {
  if (locale === "en") {
    return [
      "# LANGUAGE",
      "The application language is English.",
      "Reply in English only, even when the user writes in another language or previous messages use another language.",
      "This instruction has priority over the language used in the input and conversation history.",
      'The "prompt" and "ignoreReason" fields are shown directly to the user. Write those fields in English too.',
      "Keep names, quoted text, source data, identifiers, and machine-readable JSON values unchanged when they are not prose.",
    ].join("\n");
  }

  return [
    "# LANGUE",
    "La langue de l'application est le français.",
    "Réponds uniquement en français, même si l'utilisateur écrit dans une autre langue ou si les messages précédents utilisent une autre langue.",
    "Cette consigne est prioritaire sur la langue utilisée dans les données et l'historique de conversation.",
    'Les champs « prompt » et « ignoreReason » sont affichés directement à l’utilisateur. Rédige-les aussi en français.',
    "Conserve les noms, les textes cités, les données sources, les identifiants et les valeurs JSON destinées à la machine lorsqu'ils ne sont pas du texte courant.",
  ].join("\n");
}
