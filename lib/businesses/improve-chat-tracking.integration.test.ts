import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { businesses, improvementEvents, monthlyMetrics, subscriptionPlans, subscriptions, teamMemberRoles, teamMembers, teamRoles } from "@/db/schema";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { BUSINESS_HEADER, PATHNAME_HEADER } from "./routing";
import { cleanupIdentityFixtures, configureIntegrationDatabase, integrationDatabaseUrl, seedIdentity, type IntegrationDatabase } from "./integration-test-support";

const request = vi.hoisted(() => ({ actor: "", business: "", raw: vi.fn(), track: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ [BUSINESS_HEADER]: request.business, [PATHNAME_HEADER]: "/diagnostic-app" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: request.actor } } }) } }) }));
vi.mock("@/lib/analytics", () => ({ track: request.track }));
// Read the real monthly rows without Next's runtime cache. Authentication,
// authorization, entitlement, rate calculation and persistence remain real.
vi.mock("@/lib/diagnostic/request-cache", () => ({ getDiagnosticKpiRawData: request.raw }));

describe.skipIf(integrationDatabaseUrl() === null)("improve chat business persistence", () => {
  let database: IntegrationDatabase;
  let record: typeof import("@/lib/improve-chat-tracking").recordImproveChatOpened;
  const people: string[] = [];
  const plans: string[] = [];
  const previousAdmins = process.env.ADMIN_EMAILS;
  beforeAll(async () => {
    database = await configureIntegrationDatabase();
    process.env.ADMIN_EMAILS = "";
    record = (await import("@/lib/improve-chat-tracking")).recordImproveChatOpened;
    request.raw.mockImplementation(async (businessId: string) => ({ allMonthlyRows: await database.select().from(monthlyMetrics).where(eq(monthlyMetrics.userId, businessId)), allSettingEntries: [], allClosingEntries: [], allCallSourcesByMonth: {}, allSales: [], allLeads: [], allLeadStageHistory: [], allEmailCampaigns: [], allMetaMetrics: [], allNativeBookingLeads: [] }));
  });
  afterEach(async () => {
    await cleanupIdentityFixtures(database, people);
    if (plans.length) await database.delete(subscriptionPlans).where(inArray(subscriptionPlans.id, plans));
    people.length = 0;
    plans.length = 0;
    request.raw.mockClear();
    request.track.mockClear();
  });
  afterAll(async () => {
    if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
    await database?.$client.end();
  });
  async function person() {
    const id = randomUUID();
    people.push(id);
    await seedIdentity(database, { id, email: `${id}@multi-business.test` });
    return id;
  }
  async function business(owner: string, id = randomUUID()) {
    await database.insert(businesses).values({ id, ownerUserId: owner, name: "Tracking fixture", status: "active" });
    const planId = randomUUID();
    plans.push(planId);
    await database.insert(subscriptionPlans).values({ id: planId, key: `tracking-${planId}`, name: "Tracking team", priceMonthlyCents: 7900, features: { teamMembersEnabled: true } });
    await database.insert(subscriptions).values({ userId: id, planId, stripeCustomerId: `cus_${id}`, stripeSubscriptionId: `sub_${id}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) });
    const { year, month } = lastCompletedMonths(1)[0];
    await database.insert(monthlyMetrics).values({ userId: id, year, month, firstMessages: 100, conversations: id === owner ? 71 : 42 });
    return id;
  }
  async function open(actor: string, selected: string) {
    request.actor = actor;
    request.business = selected;
    await record({ topicType: "metric", topicKey: "responseRate", topicLabel: "Response rate", sourcePage: "/diagnostic-app" });
  }
  async function snapshot(id: string) {
    return (await database.select({ metric: businesses.lastImproveMetricKey }).from(businesses).where(eq(businesses.id, id)))[0]?.metric;
  }
  async function events(id: string) {
    return database.select().from(improvementEvents).where(eq(improvementEvents.userId, id));
  }
  it("writes only selected B when a legacy owner of A opens the metric twice", async () => {
    const owner = await person();
    const a = await business(owner, owner);
    const b = await business(owner);
    await database.update(subscriptions).set({ paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, a));
    await open(owner, b);
    await open(owner, b);
    expect(request.raw.mock.calls.map(([id]) => id)).toEqual([b, b]);
    expect(await snapshot(a)).toBeNull();
    expect(await snapshot(b)).toBe("responseRate");
    const [stored] = await database.select().from(businesses).where(eq(businesses.id, b));
    expect(stored.lastImproveMetricRateSnapshot).toBeCloseTo(0.42);
    expect(await events(a)).toHaveLength(0);
    expect(await events(b)).toHaveLength(1);
  });
  it("records a new independent owner's business even without a business matching the identity", async () => {
    const owner = await person();
    const b = await business(owner);
    await open(owner, b);
    expect(await snapshot(owner)).toBeUndefined();
    expect(await snapshot(b)).toBe("responseRate");
    expect(await events(b)).toHaveLength(1);
  });
  it("uses joined B permissions and denies a member without diagnostic permission", async () => {
    const actor = await person();
    const host = await person();
    const a = await business(actor, actor);
    const b = await business(host);
    const [membership] = await database.insert(teamMembers).values({ accountId: b, memberUserId: actor, email: `${actor}@multi-business.test`, invitedByUserId: host, status: "active" }).returning();
    const [role] = await database.insert(teamRoles).values({ accountId: b, key: "tracking-role", name: "Tracking role", permissions: ["business"] }).returning();
    await database.insert(teamMemberRoles).values({ teamMemberId: membership.id, roleId: role.id });
    await open(actor, b);
    expect(request.raw).not.toHaveBeenCalled();
    expect(await events(b)).toHaveLength(0);
    await database.update(teamRoles).set({ permissions: ["diagnostic"] }).where(eq(teamRoles.id, role.id));
    await open(actor, b);
    expect(await snapshot(a)).toBeNull();
    expect(await events(b)).toHaveLength(1);
  });
  it("denies suspended or foreign context without reading or writing either business", async () => {
    const actor = await person();
    const stranger = await person();
    const a = await business(actor, actor);
    const b = await business(actor);
    const foreign = await business(stranger);
    await database.update(subscriptions).set({ paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, b));
    await open(actor, b);
    await open(actor, foreign);
    expect(request.raw).not.toHaveBeenCalled();
    expect(request.track).not.toHaveBeenCalled();
    expect(await snapshot(a)).toBeNull();
    expect(await snapshot(b)).toBeNull();
    expect(await events(a)).toHaveLength(0);
    expect(await events(b)).toHaveLength(0);
  });
});
