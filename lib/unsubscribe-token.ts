import { createHmac, timingSafeEqual } from "node:crypto";

import { requireEnv } from "@/lib/utils";

// Signs/verifies the unsubscribe link's token so a user can't unsubscribe
// someone else by guessing their user id — HMAC-SHA256 over the userId,
// not encryption (nothing secret to hide, just tamper-proofing).
export function signUnsubscribeToken(userId: string): string {
  const secret = requireEnv("UNSUBSCRIBE_TOKEN_SECRET");
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = signUnsubscribeToken(userId);
  const expectedBuffer = Buffer.from(expected, "hex");
  const tokenBuffer = Buffer.from(token, "hex");
  if (expectedBuffer.length !== tokenBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, tokenBuffer);
}
