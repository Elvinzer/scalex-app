import { createHmac, timingSafeEqual } from "node:crypto";

export function signMetaOAuthState(nonce: string, accountId: string, appSecret: string): string {
  const signature = createHmac("sha256", appSecret).update(`${nonce}:${accountId}`).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyMetaOAuthState(state: string, accountId: string, appSecret: string): boolean {
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature) return false;
  const expected = signMetaOAuthState(nonce, accountId, appSecret).split(".")[1];
  if (!expected) return false;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
