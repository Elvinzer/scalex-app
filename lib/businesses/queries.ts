import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, businessProfile, teamMembers, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getBusinessEntitlement, getBusinessMemberEntitlement } from "@/lib/businesses/entitlements";
import { z } from "zod";
import { EMPTY_BUSINESS_PROFILE } from "@/lib/business/types";
import { isRateLimited } from "@/lib/rate-limit";

export { getSelectedBusinessId } from "./request";
export type BusinessSummary = {
  id: string; name: string; isOwner: boolean; roleLabel?: string; active: boolean; reason: string | null;
};

export async function listUserBusinesses(userId: string): Promise<BusinessSummary[]> {
  const rows = await db.selectDistinct({ id: businesses.id, name: businesses.name, ownerUserId: businesses.ownerUserId, createdAt: businesses.createdAt })
    .from(businesses).leftJoin(teamMembers, and(eq(teamMembers.accountId, businesses.id), eq(teamMembers.memberUserId, userId), eq(teamMembers.status, "active")))
    .where(and(or(eq(businesses.ownerUserId, userId), eq(teamMembers.memberUserId, userId)), sql`${businesses.status} <> 'archived'`))
    .orderBy(businesses.createdAt);
  return Promise.all(rows.map(async (row) => {
    const entitlement = await (row.ownerUserId === userId ? getBusinessEntitlement(row.id) : getBusinessMemberEntitlement(row.id));
    return { id: row.id, name: row.name, isOwner: row.ownerUserId === userId, active: entitlement.active, reason: entitlement.reason };
  }));
}

const creationSchema = z.object({ userId: z.string().uuid(), name: z.string().trim().min(1).max(100), requestId: z.string().uuid().optional() });

export async function createBusiness(userId: string, name: string, requestId?: string): Promise<string> {
  const input = creationSchema.parse({ userId, name, requestId });
  if (isRateLimited(`business-create:${userId}`, 10)) throw new Error("Business creation rate limit reached");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`business-create:${input.userId}`}))`);
    if (input.requestId) {
      const [existing] = await tx.select({ id: businesses.id, ownerUserId: businesses.ownerUserId }).from(businesses).where(eq(businesses.creationRequestId, input.requestId)).limit(1);
      if (existing) {
        if (existing.ownerUserId !== userId) throw new Error("Invalid business creation request");
        return existing.id;
      }
    }
    const [owner] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!owner) throw new Error("Authenticated identity is missing");
    const [previous] = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, userId)).limit(1);
    const exempt = isAdminEmail(owner.email);
    const [created] = await tx.insert(businesses).values({ ownerUserId: userId, name: input.name, isInitial: !previous,
      billingExempt: exempt, status: exempt ? "active" : "pending", creationRequestId: input.requestId }).returning({ id: businesses.id });
    await tx.insert(businessProfile).values({ userId: created.id, ...EMPTY_BUSINESS_PROFILE,
      identity: { ...EMPTY_BUSINESS_PROFILE.identity, businessName: input.name } });
    return created.id;
  });
}
