const STOP_WORDS = new Set([
  "avec", "dans", "des", "les", "pour", "que", "une", "sur", "par", "est", "sont", "this", "that", "with", "from", "your", "you", "the", "and", "for", "are", "is", "our",
]);

const DANGEROUS_WORDS = [
  "urgent",
  "urgence",
  "gratuit",
  "free",
  "garanti",
  "guarantee",
  "gagne",
  "winner",
  "cash",
  "argent",
  "buy now",
  "achetez maintenant",
  "click here",
  "cliquez ici",
  "act now",
  "agissez maintenant",
  "limited time",
  "offre exceptionnelle",
  "100%",
] as const;

export type EmailContentScore = {
  score: number | null;
  structure: number;
  seo: number;
  deliverability: number;
  readability: number;
  dangerousWords: string[];
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function words(value: string): string[] {
  return normalize(value).match(/[a-z0-9]{3,}/g) ?? [];
}

function meaningfulWords(value: string): Set<string> {
  return new Set(words(value).filter((word) => !STOP_WORDS.has(word)));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasAction(text: string): boolean {
  return /\b(acheter|achetez|decouvrir|decouvrez|rejoindre|rejoignez|reserver|reserve|reply|repondre|discover|join|book|learn|download|telecharger|click|cliquez)\b/i.test(
    normalize(text),
  );
}

function countSentences(text: string): number {
  return Math.max(1, text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean).length);
}

function detectDangerousWords(text: string): string[] {
  const normalized = normalize(text);
  return DANGEROUS_WORDS.filter((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.includes(" ") || normalizedTerm === "100%"
      ? normalized.includes(normalizedTerm)
      : new RegExp(`\\b${normalizedTerm}[a-z]*\\b`, "i").test(normalized);
  });
}

function emptyScore(dangerousWords: string[]): EmailContentScore {
  return { score: null, structure: 0, seo: 0, deliverability: 0, readability: 0, dangerousWords };
}

export function computeEmailContentScore({ subject, body }: { subject: string | null; body: string | null }): EmailContentScore {
  const cleanSubject = subject?.trim() ?? "";
  const cleanBody = body?.trim() ?? "";
  const dangerousWords = detectDangerousWords(`${cleanSubject}\n${cleanBody}`);
  if (!cleanBody) return emptyScore(dangerousWords);

  const subjectLength = cleanSubject.length;
  const subjectScore = !cleanSubject ? 0 : subjectLength >= 20 && subjectLength <= 70 ? 100 : subjectLength >= 10 && subjectLength <= 90 ? 70 : 40;
  const paragraphs = cleanBody.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const bodyStructureScore = cleanBody.length >= 160 && paragraphs.length >= 2 ? 100 : cleanBody.length >= 80 ? 75 : 45;
  const actionScore = hasAction(`${cleanSubject}\n${cleanBody}`) ? 100 : 35;
  const structure = clamp(subjectScore * 0.35 + bodyStructureScore * 0.45 + actionScore * 0.2);

  const subjectTerms = meaningfulWords(cleanSubject);
  const bodyTerms = meaningfulWords(cleanBody);
  const overlap = [...subjectTerms].filter((term) => bodyTerms.has(term)).length;
  const seo = clamp(
    !cleanSubject
      ? 35
      : subjectTerms.size === 0
        ? 25
        : subjectTerms.size > 0 && overlap === 0
          ? 20
          : Math.min(100, 45 + overlap * 18 + (subjectTerms.size >= 3 ? 15 : 0)),
  );

  const uppercaseLetters = (cleanBody.match(/[A-ZÀ-Ý]/g) ?? []).length;
  const letters = (cleanBody.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const shoutingPenalty = letters >= 20 && uppercaseLetters / letters > 0.45 ? 15 : 0;
  const exclamationPenalty = Math.max(0, (cleanBody.match(/!/g) ?? []).length - 1) * 5;
  const shortenerPenalty = /(bit\.ly|tinyurl\.com|t\.co|ow\.ly)\b/i.test(cleanBody) ? 15 : 0;
  const deliverability = clamp(100 - dangerousWords.length * 8 - shoutingPenalty - exclamationPenalty - shortenerPenalty);

  const bodyWords = words(cleanBody).length;
  const averageSentenceLength = bodyWords / countSentences(cleanBody);
  const lengthScore = bodyWords >= 40 && bodyWords <= 600 ? 100 : bodyWords >= 15 && bodyWords <= 900 ? 70 : 40;
  const sentenceScore = averageSentenceLength <= 24 ? 100 : averageSentenceLength <= 34 ? 70 : 45;
  const readability = clamp(lengthScore * 0.6 + sentenceScore * 0.4);

  const score = clamp(structure * 0.25 + seo * 0.25 + deliverability * 0.35 + readability * 0.15);
  return { score, structure, seo, deliverability, readability, dangerousWords };
}
