const HOUR_IN_MS = 60 * 60 * 1000;

export const NO_SHOW_FOLLOW_UP_DELAY_HOURS = 2;

export function getNoShowFollowUpDueAt(scheduledAt: Date | null, recordedAt: Date): Date {
  const referenceAt = scheduledAt ?? recordedAt;
  const suggestedDueAt = new Date(referenceAt.getTime() + NO_SHOW_FOLLOW_UP_DELAY_HOURS * HOUR_IN_MS);

  return suggestedDueAt.getTime() > recordedAt.getTime() ? suggestedDueAt : recordedAt;
}
