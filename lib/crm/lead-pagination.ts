export const CRM_DEFAULT_LEAD_LIMIT = 100;
export const CRM_PIPELINE_LEAD_LIMIT = 500;

export function normalizeCrmLeadLimit(requestedLimit?: number): number {
  return Math.min(Math.max(requestedLimit ?? CRM_DEFAULT_LEAD_LIMIT, 1), CRM_PIPELINE_LEAD_LIMIT);
}
