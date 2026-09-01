import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthIdentity } from "@/lib/auth/request";
import { requireCrmAccess, type CrmAccess } from "@/lib/crm/access";

const payloadSchema = z.object({ userId: z.string().uuid(), accountId: z.string().uuid(), expiresAt: z.number().int().positive() });
const SESSION_TTL_MS = 15 * 60_000;

function secret(): string | null {
  const value = process.env.CRM_EXTENSION_SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

export function createCrmExtensionSession(userId: string, accountId: string, now = Date.now()): string | null {
  const signingSecret = secret();
  if (!signingSecret) return null;
  const payload = encode(JSON.stringify({ userId, accountId, expiresAt: now + SESSION_TTL_MS }));
  return `${payload}.${signature(payload, signingSecret)}`;
}

export function verifyCrmExtensionSession(token: string, now = Date.now()): { userId: string; accountId: string } | null {
  const signingSecret = secret();
  if (!signingSecret) return null;
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;
  const expectedSignature = signature(payload, signingSecret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(decode(payload)));
    if (!parsed.success || parsed.data.expiresAt <= now) return null;
    return { userId: parsed.data.userId, accountId: parsed.data.accountId };
  } catch {
    return null;
  }
}

export async function getCrmExtensionAccess(request: NextRequest): Promise<CrmAccess | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;
  if (token) {
    const session = verifyCrmExtensionSession(token);
    if (!session) return null;
    const access = await requireCrmAccess(session.userId);
    return access?.accountId === session.accountId ? access : null;
  }
  const identity = await getAuthIdentity();
  return identity ? requireCrmAccess(identity.userId) : null;
}
