export type MetaAppCredentials = {
  appId: string;
  appSecret: string;
};

/**
 * Returns the credentials required by the Marketing API OAuth flow without
 * throwing from a route handler. The caller can redirect to its integration
 * screen when a deployment has not been configured yet.
 */
export function getMetaAppCredentials(): MetaAppCredentials | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}
