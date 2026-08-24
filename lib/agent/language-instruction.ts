import type { Locale } from "@/lib/i18n/config";

const FRENCH_MARKERS: Readonly<Record<string, number>> = {
  bonjour: 3,
  salut: 3,
  merci: 3,
  oui: 3,
  français: 3,
  française: 3,
  comment: 2,
  pourquoi: 2,
  quand: 2,
  "j'ai": 2,
  veux: 2,
  peux: 2,
  réponds: 2,
  améliorer: 2,
  "c'est": 2,
  ça: 2,
  où: 2,
  taux: 2,
  je: 1,
  mon: 1,
  ma: 1,
  mes: 1,
  ton: 1,
  ta: 1,
  tes: 1,
  avec: 1,
  pour: 1,
  mais: 1,
  pas: 1,
  que: 1,
  qui: 1,
  dans: 1,
  sur: 1,
  est: 1,
  suis: 1,
};

const ENGLISH_MARKERS: Readonly<Record<string, number>> = {
  hello: 3,
  hi: 3,
  thanks: 3,
  please: 3,
  yes: 3,
  english: 3,
  how: 2,
  why: 2,
  what: 2,
  when: 2,
  can: 2,
  could: 2,
  would: 2,
  should: 2,
  help: 2,
  improve: 2,
  want: 2,
  need: 2,
  answer: 2,
  speak: 2,
  my: 1,
  your: 1,
  the: 1,
  and: 1,
  with: 1,
  for: 1,
  but: 1,
  not: 1,
  this: 1,
  that: 1,
  rate: 1,
  closing: 1,
  calls: 1,
};

const MESSAGE_WORD_PATTERN = /[a-zàâçéèêëîïôùûüÿœ]+(?:['’][a-zàâçéèêëîïôùûüÿœ]+)?/giu;
const FRENCH_ACCENT_PATTERN = /[àâçéèêëîïôùûüÿœ]/iu;

function scoreMessage(words: string[], markers: Readonly<Record<string, number>>): number {
  return words.reduce((score, word) => score + (markers[word] ?? 0), 0);
}

/**
 * Detects only the two languages Falco can currently answer in. A neutral or
 * technical message returns null so the platform preference remains the
 * fallback instead of guessing from a single ambiguous word.
 */
export function detectFalcoMessageLocale(message: string): Locale | null {
  const normalized = message.toLocaleLowerCase("fr-FR");
  const words = normalized.match(MESSAGE_WORD_PATTERN) ?? [];
  if (words.length === 0) return null;

  let frenchScore = scoreMessage(words, FRENCH_MARKERS);
  const englishScore = scoreMessage(words, ENGLISH_MARKERS);
  if (FRENCH_ACCENT_PATTERN.test(normalized)) frenchScore += 2;

  const winningScore = Math.max(frenchScore, englishScore);
  if (winningScore < 2 || frenchScore === englishScore || Math.abs(frenchScore - englishScore) < 1) return null;

  return frenchScore > englishScore ? "fr" : "en";
}

export function resolveFalcoResponseLocale(platformLocale: Locale, latestUserMessage?: string | null): Locale {
  return latestUserMessage ? (detectFalcoMessageLocale(latestUserMessage) ?? platformLocale) : platformLocale;
}

export function falcoLanguageInstruction(platformLocale: Locale, responseLocale: Locale = platformLocale): string {
  const platformLanguage = platformLocale === "en" ? "English" : "French";
  const switchedLanguage = responseLocale !== platformLocale;

  if (responseLocale === "en") {
    return [
      "# LANGUAGE",
      `The platform language is ${platformLanguage}.`,
      switchedLanguage
        ? "The user's latest message is in English. Reply in English for this turn."
        : "Use English by default. If the user's latest message is clearly French, reply in French for that turn.",
      "For an ongoing conversation, follow the language of the latest user message. Switch when the user switches.",
      "If the latest message mixes languages or its language is unclear, use the platform language.",
      'The "prompt" and "ignoreReason" fields are shown directly to the user. Write those fields in English too.',
      "Keep names, quoted text, source data, identifiers, and machine-readable JSON values unchanged when they are not prose.",
    ].join("\n");
  }

  return [
    "# LANGUE",
    `La langue de la plateforme est ${platformLanguage === "French" ? "le français" : "l'anglais"}.`,
    switchedLanguage
      ? "Le dernier message de l'utilisateur est en français. Réponds en français pour ce tour."
      : "Utilise le français par défaut. Si le dernier message de l'utilisateur est clairement en anglais, réponds en anglais pour ce tour.",
    "Dans une conversation en cours, suis la langue du dernier message de l'utilisateur. Change de langue quand l'utilisateur change de langue.",
    "Si le dernier message mélange les langues ou si sa langue n'est pas claire, utilise la langue de la plateforme.",
    'Les champs « prompt » et « ignoreReason » sont affichés directement à l’utilisateur. Rédige-les aussi en français.',
    "Conserve les noms, les textes cités, les données sources, les identifiants et les valeurs JSON destinées à la machine lorsqu'ils ne sont pas du texte courant.",
  ].join("\n");
}
