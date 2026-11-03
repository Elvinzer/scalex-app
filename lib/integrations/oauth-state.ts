import { randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { decrypt, encrypt } from "@/lib/crypto";

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const stateSchema = z.object({
  provider: z.string().min(1).max(80),
  nonce: z.string().regex(/^[a-f0-9]{48}$/),
  userId: z.string().uuid(),
  businessId: z.string().uuid(),
  expiresAt: z.number().int().positive(),
  returnTo: z.string().max(500).optional(),
});

type BusinessOAuthState = z.infer<typeof stateSchema>;

// The provider sees a random nonce. The HTTP-only cookie keeps the business
// and actor in authenticated ciphertext, independent of later tab selection.
export function createBusinessOAuthState(
  input: Pick<BusinessOAuthState, "provider" | "userId" | "businessId" | "returnTo">,
  now = Date.now(),
): { nonce: string; cookie: string } {
  const state = stateSchema.parse({ ...input, nonce: randomBytes(24).toString("hex"), expiresAt: now + OAUTH_STATE_TTL_MS });
  return { nonce: state.nonce, cookie: encrypt(JSON.stringify(state)) };
}

export function readBusinessOAuthState(
  cookie: string | undefined,
  nonce: string | null,
  provider: string,
  now = Date.now(),
): BusinessOAuthState | null {
  if (!cookie || !nonce || cookie.length > 4096) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(decrypt(cookie)));
    if (!parsed.success || parsed.data.provider !== provider || parsed.data.expiresAt <= now) return null;
    const actual = Buffer.from(nonce);
    const expected = Buffer.from(parsed.data.nonce);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
