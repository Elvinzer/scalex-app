export type MetaOAuthErrorReason = "config" | "redirect_uri" | "ads_read" | "denied" | "oauth";

type MetaOAuthErrorInput = {
  error: string | null;
  reason: string | null;
  description: string | null;
};

export function classifyMetaOAuthError(input: MetaOAuthErrorInput): MetaOAuthErrorReason {
  const error = input.error?.toLowerCase() ?? "";
  const context = [input.reason, input.description].filter(Boolean).join(" ").toLowerCase();

  if (error === "access_denied" || context.includes("access denied") || context.includes("user denied")) {
    return "denied";
  }
  if (error === "redirect_uri_mismatch" || context.includes("redirect_uri") || context.includes("redirect uri")) {
    return "redirect_uri";
  }
  if (error === "invalid_scope" || context.includes("invalid scope") || context.includes("permission")) {
    return "ads_read";
  }
  if (error === "invalid_client" || error === "unauthorized_client") return "config";
  return "oauth";
}
