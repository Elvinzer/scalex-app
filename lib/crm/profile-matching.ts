import type { CrmCapturedProfile } from "./types";
import { normalizeEmail, normalizePhoneForCountry, normalizeSearchText } from "./contact";

export type CrmProfileMatchCandidate = {
  id: string;
  displayName: string;
  normalizedHandle: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  updatedAt: Date;
  profiles: Array<{ normalizedHandle: string; searchNameNormalized: string }>;
};

export type CrmProfileMatch = {
  id: string;
  signals: string[];
  score: number;
};

export function rankCrmProfileCandidates(captured: CrmCapturedProfile, candidates: CrmProfileMatchCandidate[], limit = 5): CrmProfileMatch[] {
  const normalizedName = normalizeSearchText(captured.displayName || `${captured.firstName} ${captured.lastName}`);
  const normalizedHandle = normalizeSearchText(captured.normalizedHandle);
  const normalizedPhone = captured.phone ? normalizePhoneForCountry(captured.phone).normalized : null;
  const normalizedEmail = normalizeEmail(captured.email);

  return candidates.map((candidate) => {
    const signals = new Set<string>();
    let score = 0;
    if (normalizedPhone && candidate.phoneNormalized === normalizedPhone) { signals.add("phone"); score = Math.max(score, 100); }
    if (normalizedEmail && candidate.emailNormalized === normalizedEmail) { signals.add("email"); score = Math.max(score, 100); }
    if (candidate.normalizedHandle && (candidate.normalizedHandle === captured.normalizedHandle || normalizeSearchText(candidate.normalizedHandle) === normalizedHandle)) {
      signals.add("handle");
      score = Math.max(score, 90);
    }
    if (normalizedName && normalizeSearchText(candidate.displayName) === normalizedName) {
      signals.add("name");
      score = Math.max(score, 75);
    }
    for (const profile of candidate.profiles) {
      if (profile.normalizedHandle === captured.normalizedHandle || normalizeSearchText(profile.normalizedHandle) === normalizedHandle) {
        signals.add("handle");
        score = Math.max(score, 90);
      }
      if (normalizedName && profile.searchNameNormalized === normalizedName) {
        signals.add("name");
        score = Math.max(score, 75);
      }
    }
    if (score === 0) signals.add("approximate");
    return { id: candidate.id, signals: [...signals], score: score || 40, updatedAt: candidate.updatedAt };
  })
    .sort((left, right) => right.score - left.score || right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit))
    .map(({ id, signals, score }) => ({ id, signals, score }));
}
