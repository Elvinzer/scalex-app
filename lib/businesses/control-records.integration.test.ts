import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { businesses, referralAttributions, referralCodes, referralCommissions, referralPayouts, sharedAgentUsage, subscriptionPlans, subscriptions } from "@/db/schema";
import { cleanupIdentityFixtures, configureIntegrationDatabase, integrationDatabaseUrl, seedIdentity, type IntegrationDatabase } from "./integration-test-support";

const enabled = Boolean(integrationDatabaseUrl());
describe.skipIf(!enabled)("server-owned control ledgers and referral boundaries", () => {
  let database: IntegrationDatabase;
  let ownerA: string;
  let ownerB: string;
  const businessA = randomUUID();
  const businessB = randomUUID();
  const pendingBusiness = randomUUID();
  const planId = randomUUID();
  const codeA = randomUUID();
  const codeB = randomUUID();
  const attributionId = randomUUID();

  beforeAll(async () => {
    database = await configureIntegrationDatabase();
    ownerA = await seedIdentity(database, { email: `control-a-${randomUUID()}@example.test` });
    ownerB = await seedIdentity(database, { email: `control-b-${randomUUID()}@example.test` });
    await database.insert(businesses).values([
      { id: businessA, ownerUserId: ownerA, name: "Control A", status: "active" },
      { id: businessB, ownerUserId: ownerB, name: "Control B", status: "active" },
      { id: pendingBusiness, ownerUserId: ownerA, name: "Pending control", status: "pending" },
    ]);
    await database.insert(subscriptionPlans).values({ id: planId, key: `control-${randomUUID()}`, name: "Control plan", priceMonthlyCents: 1000, features: { teamMembersEnabled: true } });
    await database.insert(subscriptions).values([
      { userId: businessA, planId, stripeCustomerId: `cus_${businessA}`, stripeSubscriptionId: `sub_${businessA}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) },
      { userId: businessB, planId, stripeCustomerId: `cus_${businessB}`, stripeSubscriptionId: `sub_${businessB}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) },
    ]);
    await database.insert(referralCodes).values([
      { id: codeA, accountId: businessA, code: `A-${randomUUID()}`, commissionRateBps: 1000 },
      { id: codeB, accountId: businessB, code: `B-${randomUUID()}`, commissionRateBps: 1000 },
    ]);
    await database.insert(sharedAgentUsage).values({ userId: businessA, periodMonth: "2099-01", requestCount: 5 });
  });

  afterAll(async () => {
    if (!database || !ownerA) return;
    await database.delete(referralCommissions).where(inArray(referralCommissions.referrerAccountId, [businessA, businessB]));
    await database.delete(referralAttributions).where(inArray(referralAttributions.referrerAccountId, [businessA, businessB]));
    await database.delete(referralPayouts).where(inArray(referralPayouts.referrerAccountId, [businessA, businessB]));
    await cleanupIdentityFixtures(database, [ownerA, ownerB]);
    await database.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  });

  async function asOwner(query: ReturnType<typeof sql>) {
    return database.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${ownerA}, true)`);
      return tx.execute(query);
    });
  }

  it("allows billing recovery reads but denies forging subscription updates", async () => {
    const read = await asOwner(sql`select status from subscriptions where user_id=${businessA}::uuid`);
    expect(read.rows).toHaveLength(1);
    await expect(asOwner(sql`update subscriptions set status='canceled' where user_id=${businessA}::uuid`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    const [persisted] = await database.select().from(subscriptions).where(eq(subscriptions.userId, businessA));
    expect(persisted.status).toBe("active");
  });

  it("denies an unpaid owner inserting a paid entitlement", async () => {
    await expect(asOwner(sql`insert into subscriptions(user_id,plan_id,stripe_customer_id,status) values(${pendingBusiness}::uuid,${planId}::uuid,'cus_forged','active')`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await database.select().from(subscriptions).where(eq(subscriptions.userId, pendingBusiness))).toHaveLength(0);
  });

  it("denies client deletion of authoritative subscription state", async () => {
    await expect(asOwner(sql`delete from subscriptions where user_id=${businessA}::uuid`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await database.select().from(subscriptions).where(eq(subscriptions.userId, businessA))).toHaveLength(1);
  });

  it("denies owner-controlled referral rates and fabricated payouts", async () => {
    await expect(asOwner(sql`update referral_codes set commission_rate_bps=10000 where id=${codeA}::uuid`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(asOwner(sql`insert into referral_payouts(referrer_account_id,currency,amount_cents) values(${businessA}::uuid,'eur',1000000)`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    const [persisted] = await database.select().from(referralCodes).where(eq(referralCodes.id, codeA));
    expect(persisted.commissionRateBps).toBe(1000);
    expect(await database.select().from(referralPayouts).where(eq(referralPayouts.referrerAccountId, businessA))).toHaveLength(0);
  });

  it("denies client changes to the shared-key quota ledger", async () => {
    await expect(asOwner(sql`delete from shared_agent_usage where user_id=${businessA}::uuid`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(asOwner(sql`update shared_agent_usage set request_count=0 where user_id=${businessA}::uuid`))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    const [persisted] = await database.select().from(sharedAgentUsage).where(eq(sharedAgentUsage.userId, businessA));
    expect(persisted.requestCount).toBe(5);
  });

  it("preserves legitimate cross-business referrals and their commission", async () => {
    await database.insert(referralAttributions).values({ id: attributionId, referralCodeId: codeA, referrerAccountId: businessA, referredAccountId: businessB });
    await database.insert(referralCommissions).values({ attributionId, referrerAccountId: businessA, referredAccountId: businessB,
      stripeInvoiceId: `in_${randomUUID()}`, stripeSubscriptionId: `sub_${businessB}`, currency: "eur", grossAmountCents: 10000,
      eligibleAmountCents: 10000, commissionRateBps: 1000, commissionAmountCents: 1000 });
    const read = await asOwner(sql`select id from referral_attributions where id=${attributionId}::uuid`);
    expect(read.rows).toHaveLength(1);
    expect(await database.select().from(referralCommissions).where(eq(referralCommissions.attributionId, attributionId))).toHaveLength(1);
  });

  it("rejects a referral whose code does not belong to the referrer", async () => {
    await expect(database.insert(referralAttributions).values({ referralCodeId: codeB, referrerAccountId: businessA, referredAccountId: businessB }))
      .rejects.toMatchObject({ cause: { code: "23514", message: "The referral code belongs to another business" } });
  });

  it("rejects self-referrals between two businesses of the same owner", async () => {
    await expect(database.insert(referralAttributions).values({ referralCodeId: codeA, referrerAccountId: businessA, referredAccountId: pendingBusiness }))
      .rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
