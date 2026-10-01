const CRM_LIST_PATHS = new Set([
  "/crm",
  "/crm/leads",
  "/crm/pipeline",
  "/crm/actions",
  "/crm/appels",
]);

export function safeCrmReturnPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;

  try {
    const url = new URL(value, "https://minaly.invalid");
    if (url.origin !== "https://minaly.invalid" || !CRM_LIST_PATHS.has(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
