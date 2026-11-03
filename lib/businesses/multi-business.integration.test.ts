import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { agentTokenUsage, businesses, businessProfile, nativeBookingEvents, nativeBookingNotifications, nativeBookingReminderDeliveries, nativeBookingReminderRules, nativeBookings, sharedAgentUsage, subscriptionPlans, subscriptions, teamMemberRoles, teamMembers, teamRoles, users } from "@/db/schema";
import { EMPTY_BUSINESS_PROFILE } from "@/lib/business/types";
import { BUSINESS_HEADER, PATHNAME_HEADER } from "@/lib/businesses/routing";

import { cleanupIdentityFixtures, configureIntegrationDatabase, identityStillExists, integrationDatabaseUrl, seedIdentity, type IntegrationDatabase } from "./integration-test-support";

const mocks = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
  identity: vi.fn<() => Promise<{ userId: string; email: string } | null>>(),
  claims: vi.fn<() => Promise<{ data: { claims: { sub: string; email: string } | null } }>>(),
  signOut: vi.fn(async () => ({ error: null })),
  deleteUser: vi.fn<(userId: string) => Promise<{ error: null }>>(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`TEST_REDIRECT:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth/request", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims, signOut: mocks.signOut } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(async () => {}), identifyUser: vi.fn(async () => {}) }));
vi.mock("@/lib/resend-client", () => ({ isResendConfigured: () => false, getResendClient: () => { throw new Error("Vendor transport must not run in database tests"); } }));

type RequestContext = { userId: string; email: string; headers: Headers };
const requests = new AsyncLocalStorage<RequestContext>();
const enabled = integrationDatabaseUrl() !== null;

describe.skipIf(!enabled)("multi-business actual PostgreSQL boundaries", () => {
  let database: IntegrationDatabase;
  let query: typeof import("./queries");
  let context: typeof import("@/lib/team/context");
  let currentUser: typeof import("@/lib/current-user");
  let businessActions: typeof import("@/app/(app)/business/actions");
  let teamActions: typeof import("@/app/(app)/settings/equipe/actions");
  let inviteActions: typeof import("@/app/invite/[token]/actions");
  let settingsActions: typeof import("@/app/(app)/settings/actions");
  let entitlements: typeof import("./entitlements");
  let quota: typeof import("@/lib/agent/quota");
  let recovery: typeof import("@/lib/inngest/business-recovery");
  let inngestClient: typeof import("@/lib/inngest/client");
  const identities = new Map<string, string>();
  const fixtureUsers: string[] = [];
  const fixturePlans: string[] = [];
  const originalAdmins = process.env.ADMIN_EMAILS;

  beforeAll(async () => {
    database = await configureIntegrationDatabase();
    mocks.headers.mockImplementation(async () => requests.getStore()?.headers ?? new Headers());
    mocks.identity.mockImplementation(async () => {
      const request = requests.getStore();
      return request ? { userId: request.userId, email: request.email } : null;
    });
    mocks.claims.mockImplementation(async () => {
      const request = requests.getStore();
      return { data: { claims: request ? { sub: request.userId, email: request.email } : null } };
    });
    mocks.deleteUser.mockImplementation(async (userId) => {
      await database.execute(sql`delete from auth.users where id = ${userId}::uuid`);
      return { error: null };
    });
    [query, context, currentUser, businessActions, teamActions, inviteActions, settingsActions, entitlements, quota, recovery, inngestClient] = await Promise.all([
      import("./queries"), import("@/lib/team/context"), import("@/lib/current-user"),
      import("@/app/(app)/business/actions"), import("@/app/(app)/settings/equipe/actions"),
      import("@/app/invite/[token]/actions"), import("@/app/(app)/settings/actions"), import("./entitlements"),
      import("@/lib/agent/quota"), import("@/lib/inngest/business-recovery"), import("@/lib/inngest/client"),
    ]);
  });

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "";
    mocks.signOut.mockClear();
    mocks.deleteUser.mockClear();
  });

  afterEach(async () => {
    await cleanupIdentityFixtures(database, fixtureUsers);
    if (fixturePlans.length > 0) await database.delete(subscriptionPlans).where(inArray(subscriptionPlans.id, fixturePlans));
    fixtureUsers.length = 0;
    fixturePlans.length = 0;
    identities.clear();
  });

  afterAll(async () => {
    if (originalAdmins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAdmins;
    await database?.$client.end();
  });

  async function person(label: string) {
    const id = randomUUID();
    const email = `${label}-${id}@multi-business.test`;
    fixtureUsers.push(id);
    await seedIdentity(database, { id, email });
    identities.set(id, email);
    return id;
  }

  function request<T>(userId: string, businessId: string | null, action: () => T, path = "/business"): T {
    const email = identities.get(userId);
    if (!email) throw new Error("Unknown local fixture identity");
    const requestHeaders = new Headers({ [PATHNAME_HEADER]: path });
    if (businessId) requestHeaders.set(BUSINESS_HEADER, businessId);
    return requests.run({ userId, email, headers: requestHeaders }, action);
  }

  async function paidBusiness(ownerUserId: string, name: string, team = true) {
    const [business] = await database.insert(businesses).values({ ownerUserId, name, status: "active", onboardingCompleted: true, crmEnabled: true }).returning();
    await database.insert(businessProfile).values({ userId: business.id, ...EMPTY_BUSINESS_PROFILE, identity: { ...EMPTY_BUSINESS_PROFILE.identity, businessName: name } });
    const planId = randomUUID();
    fixturePlans.push(planId);
    await database.insert(subscriptionPlans).values({ id: planId, key: `integration-${planId}`, name: team ? "Fixture team" : "Fixture solo", priceMonthlyCents: 7900, features: { teamMembersEnabled: team, maxTeamMembers: 3 }, stripePriceId: `price_fixture_${planId}` });
    await database.insert(subscriptions).values({ userId: business.id, planId, stripeCustomerId: `cus_fixture_${business.id}`, stripeSubscriptionId: `sub_fixture_${business.id}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) });
    return business.id;
  }

  async function member(businessId: string, ownerId: string, memberId: string, permissions: string[] = ["business"]) {
    const [role] = await database.insert(teamRoles).values({ accountId: businessId, key: `fixture-${randomUUID()}`, name: "Fixture role", permissions }).returning({ id: teamRoles.id });
    const [membership] = await database.insert(teamMembers).values({ accountId: businessId, memberUserId: memberId, email: identities.get(memberId) ?? "", status: "active", invitedByUserId: ownerId, joinedAt: new Date() }).returning({ id: teamMembers.id });
    await database.insert(teamMemberRoles).values({ teamMemberId: membership.id, roleId: role.id });
    return { membershipId: membership.id, roleId: role.id };
  }

  it("creates independent businesses without synthetic identities and deduplicates concurrent submission", async () => {
    const owner = await person("admin");
    process.env.ADMIN_EMAILS = identities.get(owner);
    const requestId = randomUUID();
    const [first, duplicate] = await Promise.all([
      query.createBusiness(owner, "First independent business", requestId),
      query.createBusiness(owner, "First independent business", requestId),
    ]);
    const second = await query.createBusiness(owner, "Second independent business", randomUUID());
    expect(first).toBe(duplicate);
    expect(first).not.toBe(second);
    expect([first, second]).not.toContain(owner);
    expect(await database.select().from(users).where(inArray(users.id, [first, second]))).toHaveLength(0);
    const authRows = await database.execute(sql`select id from auth.users where id in (${first}::uuid, ${second}::uuid)`);
    expect(authRows.rows).toHaveLength(0);
    const rows = await database.select().from(businesses).where(eq(businesses.ownerUserId, owner));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.billingExempt)).toBe(true);
    const profile = await database.select().from(businessProfile).where(eq(businessProfile.userId, second));
    expect(profile[0].identity.businessName).toBe("Second independent business");
    expect((await query.listUserBusinesses(owner)).map((row) => row.active)).toEqual([true, true]);
    process.env.ADMIN_EMAILS = "";
    expect(await entitlements.getBusinessEntitlement(second)).toMatchObject({ active: false, isExempt: false, reason: "payment_required" });
  });

  it("does not inherit a previous business subscription or credentials during additional creation", async () => {
    const owner = await person("owner");
    const first = await paidBusiness(owner, "Existing paid business");
    await database.update(businesses).set({ anthropicApiKeyEncrypted: "fixture-encrypted-value", stripeConnectId: "acct_fixture", youtubeConnected: true }).where(eq(businesses.id, first));
    const second = await query.createBusiness(owner, "New unpaid business", randomUUID());
    const [created] = await database.select().from(businesses).where(eq(businesses.id, second));
    expect(created).toMatchObject({ status: "pending", isInitial: false, billingExempt: false, anthropicApiKeyEncrypted: null, stripeConnectId: null, youtubeConnected: false });
    expect(await database.select().from(subscriptions).where(eq(subscriptions.userId, second))).toHaveLength(0);
    expect(await entitlements.getBusinessEntitlement(first)).toMatchObject({ active: true });
    expect(await request(owner, second, () => context.getAccountContext(owner))).toBeNull();
    expect(await request(owner, second, () => context.requireOwner(owner, { allowSuspended: true }))).toEqual({ accountId: second });
  });

  it("accepts an invitation without replacing an owned business and preserves independent permissions", async () => {
    const hostOwner = await person("host");
    const invitee = await person("invitee");
    const outsider = await person("outsider");
    const host = await paidBusiness(hostOwner, "Host business");
    const own = await paidBusiness(invitee, "Invitee owned business");
    const [role] = await database.insert(teamRoles).values({ accountId: host, key: "business-only", name: "Business editor", permissions: ["business"] }).returning({ id: teamRoles.id });
    const invited = await request(hostOwner, host, () => teamActions.inviteMember({ email: identities.get(invitee), roleIds: [role.id] }));
    expect(invited.error).toBeNull();
    const [pending] = await database.select().from(teamMembers).where(and(eq(teamMembers.accountId, host), eq(teamMembers.email, identities.get(invitee) ?? "")));
    expect(pending.inviteToken).toBeTruthy();
    const token = pending.inviteToken ?? "";
    expect((await request(outsider, null, () => inviteActions.acceptInvite(token))).error).not.toBeNull();
    expect((await database.select().from(teamMembers).where(eq(teamMembers.id, pending.id)))[0].status).toBe("invited");
    const accepted = await request(invitee, own, () => inviteActions.acceptInvite(token));
    expect(accepted.error).toBeNull();
    expect(accepted.redirectTo).toBe(`/b/${host}/business`);
    expect((await request(invitee, own, () => inviteActions.acceptInvite(token))).error).not.toBeNull();
    const available = await query.listUserBusinesses(invitee);
    expect(available).toEqual(expect.arrayContaining([expect.objectContaining({ id: own, isOwner: true }), expect.objectContaining({ id: host, isOwner: false })]));
    expect(await request(invitee, host, () => context.requirePermission(invitee, "business"))).toEqual({ accountId: host });
    expect(await request(invitee, host, () => context.requirePermission(invitee, "datas"))).toBeNull();
    expect(await request(invitee, host, () => context.requireOwner(invitee))).toBeNull();
    expect(await request(invitee, own, () => context.requireOwner(invitee))).toEqual({ accountId: own });
    expect(await database.select().from(subscriptions).where(eq(subscriptions.userId, invitee))).toHaveLength(0);
  });

  it("rejects a role from another business before creating an invitation", async () => {
    const owner = await person("owner");
    const first = await paidBusiness(owner, "A");
    const second = await paidBusiness(owner, "B");
    const [foreignRole] = await database.insert(teamRoles).values({ accountId: second, key: "foreign-role", name: "Foreign role", permissions: ["business"] }).returning({ id: teamRoles.id });
    const result = await request(owner, first, () => teamActions.inviteMember({ email: "new-member@multi-business.test", roleIds: [foreignRole.id] }));
    expect(result.error).not.toBeNull();
    expect(await database.select().from(teamMembers).where(eq(teamMembers.accountId, first))).toHaveLength(0);
  });

  it("revokes member access on the next request and preserves the last authorized write", async () => {
    const owner = await person("owner");
    const editor = await person("editor");
    const business = await paidBusiness(owner, "Editable business");
    const joined = await member(business, owner, editor);
    const saved = await request(editor, business, () => businessActions.saveBusinessSection("identity", { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Authorized edit", niche: "Before removal" }));
    expect(saved.error).toBeNull();
    expect((await request(owner, business, () => teamActions.removeMember(joined.membershipId))).error).toBeNull();
    const rejected = await request(editor, business, () => businessActions.saveBusinessSection("identity", { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Forbidden edit", niche: "After removal" }));
    expect(rejected.error).not.toBeNull();
    const [stored] = await database.select().from(businessProfile).where(eq(businessProfile.userId, business));
    expect(stored.identity.businessName).toBe("Authorized edit");
    expect(stored.identity.niche).toBe("Before removal");
    expect(await request(editor, business, () => context.getAccountContext(editor, { allowSuspended: true }))).toBeNull();
  });

  it("blocks owner operations on payment failure while allowing recovery and another business", async () => {
    const owner = await person("owner");
    const first = await paidBusiness(owner, "Business A");
    const second = await paidBusiness(owner, "Business B");
    await database.update(subscriptions).set({ paymentBlockedAt: new Date(), status: "past_due" }).where(eq(subscriptions.userId, second));
    expect(await request(owner, second, () => context.requirePermission(owner, "business"))).toBeNull();
    expect(await request(owner, second, () => context.getAccountContext(owner, { allowSuspended: true }))).toMatchObject({ accountId: second, entitlement: { active: false, reason: "payment_failed" } });
    const denied = await request(owner, second, () => businessActions.saveBusinessSection("identity", { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Unpaid change" }));
    expect(denied.error).not.toBeNull();
    expect((await database.select().from(businessProfile).where(eq(businessProfile.userId, second)))[0].identity.businessName).toBe("Business B");
    expect(await request(owner, first, () => context.requirePermission(owner, "business"))).toEqual({ accountId: first });
    await expect(request(owner, second, () => currentUser.getCurrentUser())).rejects.toThrow(`/b/${second}/settings/facturation`);
    await database.update(subscriptions).set({ paymentBlockedAt: null, status: "active" }).where(eq(subscriptions.userId, second));
    expect(await request(owner, second, () => context.requirePermission(owner, "business"))).toEqual({ accountId: second });
  });

  it("denies a Solo-plan member without suspending its owner", async () => {
    const owner = await person("owner");
    const editor = await person("editor");
    const business = await paidBusiness(owner, "Solo business", false);
    await member(business, owner, editor);
    expect(await request(owner, business, () => context.getAccountContext(owner))).toMatchObject({ isOwner: true, entitlement: { active: true } });
    expect(await request(editor, business, () => context.getAccountContext(editor))).toBeNull();
    expect(await request(editor, business, () => context.getAccountContext(editor, { allowSuspended: true }))).toMatchObject({ entitlement: { active: false, reason: "team_unavailable" } });
    expect(await query.listUserBusinesses(editor)).toEqual([expect.objectContaining({ id: business, active: false, reason: "team_unavailable" })]);
  });

  it("keeps simultaneous same-person requests and real action writes pinned to their business", async () => {
    const owner = await person("owner");
    const first = await paidBusiness(owner, "Original A");
    const second = await paidBusiness(owner, "Original B");
    await Promise.all([
      request(owner, first, async () => {
        expect((await currentUser.getCurrentUser()).accountId).toBe(first);
        const result = await businessActions.saveBusinessSection("identity", { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Persisted A", niche: "Only A" });
        expect(result.error).toBeNull();
      }),
      request(owner, second, async () => {
        expect((await currentUser.getCurrentUser()).accountId).toBe(second);
        const result = await businessActions.saveBusinessSection("identity", { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Persisted B", niche: "Only B" });
        expect(result.error).toBeNull();
      }),
    ]);
    const profiles = await database.select().from(businessProfile).where(inArray(businessProfile.userId, [first, second]));
    expect(profiles.find((row) => row.userId === first)?.identity).toMatchObject({ businessName: "Persisted A", niche: "Only A" });
    expect(profiles.find((row) => row.userId === second)?.identity).toMatchObject({ businessName: "Persisted B", niche: "Only B" });
    const resolved = await Promise.all(Array.from({ length: 12 }, (_, index) => {
      const selected = index % 2 === 0 ? first : second;
      return request(owner, selected, async () => ({ expected: selected, actual: (await context.getAccountContext(owner))?.accountId }));
    }));
    expect(resolved.every((row) => row.actual === row.expected)).toBe(true);
  });

  it("fails closed for unknown explicit business and unscoped API requests", async () => {
    const owner = await person("owner");
    await paidBusiness(owner, "Owned business");
    const unknown = randomUUID();
    expect(await request(owner, unknown, () => context.getAccountContext(owner))).toBeNull();
    expect(await request(owner, null, () => context.getAccountContext(owner), "/api/improve-chat")).toBeNull();
    expect(await request(owner, null, () => context.getAccountContext(owner, { businessId: "invalid-id" }))).toBeNull();
    await expect(request(owner, unknown, () => currentUser.getCurrentUser())).rejects.toThrow("TEST_REDIRECT:/businesses");
  });

  it("does not exempt a customer business when a platform admin is only a member", async () => {
    const owner = await person("customer");
    const admin = await person("admin");
    process.env.ADMIN_EMAILS = identities.get(admin);
    const business = await paidBusiness(owner, "Customer business");
    await member(business, owner, admin);
    await database.update(subscriptions).set({ status: "past_due", paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, business));
    expect(await request(admin, business, () => context.getAccountContext(admin))).toBeNull();
    expect(await request(admin, business, () => context.getAccountContext(admin, { allowSuspended: true }))).toMatchObject({ isOwner: false, entitlement: { active: false, isExempt: false } });
    expect(await entitlements.getBusinessEntitlement(business)).toMatchObject({ active: false, isExempt: false });
  });

  it("blocks deleting an owner and preserves business history when a member deletes their login", async () => {
    const owner = await person("owner");
    const editor = await person("member");
    const business = await paidBusiness(owner, "Preserved business");
    const joined = await member(business, owner, editor);
    const [usage] = await database.insert(agentTokenUsage).values({ businessId: business, actorUserId: editor, keySource: "shared", operation: "integration-fixture", inputTokens: 17, outputTokens: 23 }).returning({ id: agentTokenUsage.id });
    const blocked = await request(owner, business, () => settingsActions.deleteAccount(identities.get(owner) ?? ""));
    expect(blocked.error).toBe("deleteOwnedBusinessBlock");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await expect(database.delete(users).where(eq(users.id, owner))).rejects.toThrow();
    expect(await identityStillExists(database, owner)).toBe(true);
    const removed = await request(editor, business, () => settingsActions.deleteAccount(identities.get(editor) ?? ""));
    expect(removed.error).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.deleteUser).toHaveBeenCalledWith(editor);
    expect(await identityStillExists(database, editor)).toBe(false);
    expect((await database.select().from(teamMembers).where(eq(teamMembers.id, joined.membershipId)))[0].memberUserId).toBeNull();
    expect((await database.select().from(agentTokenUsage).where(eq(agentTokenUsage.id, usage.id)))[0]).toMatchObject({ businessId: business, actorUserId: null, inputTokens: 17, outputTokens: 23 });
    expect((await database.select().from(businessProfile).where(eq(businessProfile.userId, business)))[0].identity.businessName).toBe("Preserved business");
  });

  it("enforces real RLS owner/member reads and rejects foreign business writes", async () => {
    const firstOwner = await person("owner-a");
    const secondOwner = await person("owner-b");
    const editor = await person("member");
    const outsider = await person("outsider");
    const first = await paidBusiness(firstOwner, "RLS A");
    const second = await paidBusiness(secondOwner, "RLS B");
    await member(first, firstOwner, editor, ["business"]);
    async function visible(actor: string) {
      return database.transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`select set_config('request.jwt.claim.sub', ${actor}, true)`);
        const rows = await tx.select({ businessId: businessProfile.userId }).from(businessProfile).where(inArray(businessProfile.userId, [first, second]));
        return rows.map((row) => row.businessId);
      });
    }
    expect(await visible(firstOwner)).toEqual([first]);
    expect(await visible(secondOwner)).toEqual([second]);
    expect(await visible(editor)).toEqual([first]);
    expect(await visible(outsider)).toEqual([]);

    const ownWrite = await database.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${firstOwner}, true)`);
      return tx.update(businessProfile).set({ identity: { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Owner RLS write" } }).where(eq(businessProfile.userId, first)).returning({ businessId: businessProfile.userId });
    });
    expect(ownWrite).toEqual([{ businessId: first }]);
    const foreignWrite = await database.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${firstOwner}, true)`);
      return tx.update(businessProfile).set({ identity: { ...EMPTY_BUSINESS_PROFILE.identity, businessName: "Forbidden RLS write" } }).where(eq(businessProfile.userId, second)).returning({ businessId: businessProfile.userId });
    });
    expect(foreignWrite).toEqual([]);
    expect((await database.select().from(businessProfile).where(eq(businessProfile.userId, second)))[0].identity.businessName).toBe("RLS B");
    expect((await database.select().from(businessProfile).where(eq(businessProfile.userId, first)))[0].identity.businessName).toBe("Owner RLS write");

    await database.update(subscriptions).set({ status: "past_due", paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, first));
    expect(await visible(firstOwner)).toEqual([]);
    expect(await visible(editor)).toEqual([]);
  });

  it("serializes shared-key reservations across independent businesses at the platform ceiling", async () => {
    const owner = await person("quota-owner");
    const first = await paidBusiness(owner, "Quota A");
    const second = await paidBusiness(owner, "Quota B");
    const previousLimit = process.env.ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT;
    const previousDisabled = process.env.ANTHROPIC_SHARED_DISABLED;
    const now = new Date();
    const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [existing] = await database.select({ count: sql<number>`coalesce(sum(${sharedAgentUsage.requestCount}), 0)::integer` }).from(sharedAgentUsage).where(eq(sharedAgentUsage.periodMonth, periodMonth));
    process.env.ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT = String(Number(existing?.count ?? 0) + 1);
    process.env.ANTHROPIC_SHARED_DISABLED = "false";
    try {
      const results = await Promise.allSettled([quota.checkAndIncrementSharedUsage(first), quota.checkAndIncrementSharedUsage(second)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const usage = await database.select().from(sharedAgentUsage).where(inArray(sharedAgentUsage.userId, [first, second]));
      expect(usage.reduce((total, row) => total + row.requestCount, 0)).toBe(1);
      process.env.ANTHROPIC_SHARED_DISABLED = "true";
      await expect(quota.checkAndIncrementSharedUsage(first)).rejects.toBeInstanceOf(quota.SharedKeyQuotaExceededError);
      expect((await database.select().from(sharedAgentUsage).where(inArray(sharedAgentUsage.userId, [first, second]))).reduce((total, row) => total + row.requestCount, 0)).toBe(1);
    } finally {
      if (previousLimit === undefined) delete process.env.ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT;
      else process.env.ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT = previousLimit;
      if (previousDisabled === undefined) delete process.env.ANTHROPIC_SHARED_DISABLED;
      else process.env.ANTHROPIC_SHARED_DISABLED = previousDisabled;
    }
  });

  it("retains suspended outbox work and resumes only that business with stable replay identities", async () => {
    const owner = await person("recovery-owner");
    const first = await paidBusiness(owner, "Recovery A");
    const second = await paidBusiness(owner, "Recovery B");
    async function pendingBooking(businessId: string) {
      const [event] = await database.insert(nativeBookingEvents).values({ userId: businessId, slug: `fixture-${randomUUID()}`, name: "Fixture booking", status: "active" }).returning({ id: nativeBookingEvents.id });
      const [rule] = await database.insert(nativeBookingReminderRules).values({ eventId: event.id, delayMinutes: 60, subject: "Fixture reminder", message: "Fixture reminder body" }).returning({ id: nativeBookingReminderRules.id });
      const startAt = new Date(Date.now() + 86_400_000);
      const [booking] = await database.insert(nativeBookings).values({ userId: businessId, eventId: event.id, idempotencyKey: randomUUID(), status: "confirmed", syncStatus: "pending", firstName: "Fixture", lastName: "Guest", phone: "+12025550123", phoneNormalized: "+12025550123", guestTimeZone: "UTC", eventTimeZone: "UTC", startAt, endAt: new Date(startAt.getTime() + 3_600_000) }).returning({ id: nativeBookings.id });
      const [notification] = await database.insert(nativeBookingNotifications).values({ bookingId: booking.id, kind: "confirmation", status: "pending" }).returning({ id: nativeBookingNotifications.id });
      const [reminder] = await database.insert(nativeBookingReminderDeliveries).values({ bookingId: booking.id, ruleId: rule.id, scheduledFor: new Date(startAt.getTime() - 3_600_000), status: "pending" }).returning({ id: nativeBookingReminderDeliveries.id });
      return { bookingId: booking.id, notificationId: notification.id, reminderId: reminder.id };
    }
    const firstWork = await pendingBooking(first);
    const secondWork = await pendingBooking(second);
    const send = vi.spyOn(inngestClient.inngest, "send").mockResolvedValue({ ids: [] });
    try {
      await database.update(subscriptions).set({ status: "past_due", paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, first));
      await recovery.resumeBusinessOperations(first);
      expect(send).not.toHaveBeenCalled();
      expect((await database.select().from(nativeBookingNotifications).where(eq(nativeBookingNotifications.id, firstWork.notificationId)))[0].status).toBe("pending");
      await database.update(subscriptions).set({ status: "active", paymentBlockedAt: null }).where(eq(subscriptions.userId, first));
      await recovery.resumeBusinessOperations(first);
      expect(send).toHaveBeenCalledTimes(3);
      const initialEvents = JSON.stringify(send.mock.calls);
      expect(initialEvents).toContain(firstWork.bookingId);
      expect(initialEvents).toContain(firstWork.reminderId);
      expect(initialEvents).not.toContain(secondWork.bookingId);
      expect(initialEvents).not.toContain(secondWork.reminderId);
      send.mockClear();
      send.mockRejectedValueOnce(new Error("Fixture transport failure"));
      await expect(recovery.resumeBusinessOperations(first)).rejects.toThrow("Fixture transport failure");
      expect((await database.select().from(nativeBookingNotifications).where(eq(nativeBookingNotifications.id, firstWork.notificationId)))[0].status).toBe("pending");
      send.mockClear();
      await recovery.resumeBusinessOperations(first);
      expect(JSON.stringify(send.mock.calls)).toBe(initialEvents);
      expect((await database.select().from(nativeBookingNotifications).where(eq(nativeBookingNotifications.id, secondWork.notificationId)))[0].status).toBe("pending");
    } finally {
      send.mockRestore();
    }
  });
});

describe("integration database guard", () => {
  it("rejects shared targets before opening a connection", () => {
    const original = process.env.MULTI_BUSINESS_TEST_DATABASE_URL;
    try {
      process.env.MULTI_BUSINESS_TEST_DATABASE_URL = "postgresql://localhost/postgres";
      expect(() => integrationDatabaseUrl()).toThrow("loopback database");
      process.env.MULTI_BUSINESS_TEST_DATABASE_URL = "postgresql://database.example/minaly_multibusiness_fixture";
      expect(() => integrationDatabaseUrl()).toThrow("loopback database");
    } finally {
      if (original === undefined) delete process.env.MULTI_BUSINESS_TEST_DATABASE_URL;
      else process.env.MULTI_BUSINESS_TEST_DATABASE_URL = original;
    }
  });
});
