export const CRM_DEFAULT_LEAD_LIMIT = 100;
export const CRM_PIPELINE_LEAD_LIMIT = 500;
export const CRM_LEADS_PAGE_SIZE = 25;
export const CRM_PIPELINE_STAGE_PAGE_SIZE = 15;

export function normalizeCrmLeadLimit(requestedLimit?: number): number {
  return Math.min(Math.max(requestedLimit ?? CRM_DEFAULT_LEAD_LIMIT, 1), CRM_PIPELINE_LEAD_LIMIT);
}
