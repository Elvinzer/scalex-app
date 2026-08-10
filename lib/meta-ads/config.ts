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
 * throwing from a route handler. A dedicated META pair wins; when neither
 * META variable is present, the Instagram pair is reused because both
 * products can belong to the same Meta App. Pairs are never mixed.
 */
export function getMetaAppCredentials(): MetaAppCredentials | null {
  const hasExplicitMetaConfiguration = Boolean(process.env.META_APP_ID || process.env.META_APP_SECRET);
  if (hasExplicitMetaConfiguration) return readPair("META_APP_ID", "META_APP_SECRET");
  return readPair("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET");
}
