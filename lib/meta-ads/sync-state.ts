import { MetaApiError } from "./client";

export type MetaConnectionFailureStatus = "token_expired" | "permission_revoked" | "account_inaccessible" | "connected";

export function metaConnectionFailureStatus(error: unknown): MetaConnectionFailureStatus {
  if (error instanceof MetaApiError && error.code === 190) return "token_expired";
  if (error instanceof MetaApiError && (error.code === 10 || error.code === 200 || error.code === 2000)) return "permission_revoked";
  if (error instanceof Error && error.message.includes("n'est plus accessible")) return "account_inaccessible";
  return "connected";
}

export function metaSyncErrorMessage(error: unknown): string {
  return error instanceof MetaApiError ? error.message : "La synchronisation Meta a échoué.";
}

export function isMetaTokenExpiredError(error: unknown): boolean {
  return error instanceof MetaApiError && error.code === 190;
}
