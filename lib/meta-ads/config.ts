export type MetaAppCredentials = {
  appId: string;
  appSecret: string;
};

function readPair(idName: string, secretName: string): MetaAppCredentials | null {
  const appId = process.env[idName]?.trim();
  const appSecret = process.env[secretName]?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

/**
 * Returns the credentials required by the Marketing API OAuth flow without
 * throwing from a route handler. Marketing API credentials are deliberately
 * kept separate from the Instagram Login credentials: the two integrations
 * use different OAuth products and scopes, even when they are configured in
 * the same Meta developer account.
 */
export function getMetaAppCredentials(): MetaAppCredentials | null {
  return readPair("META_APP_ID", "META_APP_SECRET");
}
