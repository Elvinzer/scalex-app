import type { InsightSnapshot } from "./types";

export function actionTextForInsight(record: { sourceType: string; snapshot: InsightSnapshot; insightText: string }): string {
  const recommendedAction = record.sourceType === "meta_ads" ? record.snapshot.recommendedAction : null;
  return typeof recommendedAction === "string" && recommendedAction.trim() ? recommendedAction : record.insightText;
}
