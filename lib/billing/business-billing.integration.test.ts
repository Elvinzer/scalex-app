import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businesses, processedStripeEvents, subscriptionPlans, subscriptions, teamMembers } from "@/db/schema";
import { cleanupIdentityFixtures, configureIntegrationDatabase, integrationDatabaseUrl, seedIdentity } from "@/lib/businesses/integration-test-support";

const fake = vi.hoisted(() => ({
  actor: { userId: "", email: "" }, target: "", canonical: new Map<string, unknown>(),
  constructEvent: vi.fn(), customerCreate: vi.fn(), checkoutCreate: vi.fn(), checkoutRetrieve: vi.fn(),
  portalCreate: vi.fn(), recovery: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/request", () => ({ getAuthIdentity: async () => fake.actor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (callback: unknown) => callback }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`TEST_REDIRECT:${path}`); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-minaly-business-id": fake.target, "x-minaly-pathname": "/api/billing/checkout" }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("@/lib/inngest/business-recovery", () => ({ resumeBusinessOperations: fake.recovery }));
vi.mock("@/lib/stripe/platform-client", () => ({ getPlatformStripeClient: () => ({
  webhooks: { constructEvent: fake.constructEvent },
  subscriptions: { retrieve: async (id: string) => {
    const value = fake.canonical.get(id);
    if (!value) throw new Error("Unknown fixture subscription");
    return value;
  } },
  customers: { create: fake.customerCreate },
  checkout: { sessions: { create: fake.checkoutCreate, retrieve: fake.checkoutRetrieve } },
  billingPortal: { sessions: { create: fake.portalCreate } },
  }),
}));

describe.skipIf(!integrationDatabaseUrl())("business billing through signed handlers and PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof configureIntegrationDatabase>>;
  let webhook: typeof import("@/app/api/webhooks/stripe-billing/route");
  let checkout: typeof import("@/app/api/billing/checkout/route");
  let portal: typeof import("@/app/api/billing/portal/route");
  let entitlement: typeof import("@/lib/businesses/entitlements");
  let inviteActions: typeof import("@/app/invite/[token]/actions");
  let onboardingActions: typeof import("@/app/onboarding/actions");
  const ownerId = randomUUID(), memberId = randomUUID(), inviteeId = randomUUID(), businessId = randomUUID(), otherBusinessId = randomUUID(), planId = randomUUID();
  const suffix = randomUUID();
  const subscriptionId = `sub_${suffix}`, customerId = `cus_${suffix}`, invoiceId = `in_${suffix}`;
  const planKey = `billing-${suffix}`;
  const secret = "whsec_multibusiness_local_fixture";
  const signer = new Stripe("sk_test_multibusiness_local_fixture");
  const events: string[] = [];
  let previousAdminEmails: string | undefined;
  let previousWebhookSecret: string | undefined;

  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: subscriptionId, customer: customerId, status: "active", cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 86_400,
      metadata: { businessId, planId },
      items: { data: [{ price: { id: `price_${suffix}`, unit_amount: 7900, recurring: { interval: "month" } } }] },
      latest_invoice: { id: invoiceId, status: "paid", paid: true, amount_remaining: 0, attempt_count: 1 },
      ...overrides,
    };
  }

  async function seedSubscription() {
    await database.update(businesses).set({ stripeCustomerId: customerId, status: "active" }).where(eq(businesses.id, businessId));
    await database.insert(subscriptions).values({
      userId: businessId, planId, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId,
      status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000), latestInvoiceId: invoiceId,
    });
  }

  async function deliver(type: string, object: unknown, id = `evt_${randomUUID()}`, valid = true) {
    if (!events.includes(id)) events.push(id);
    const body = JSON.stringify({ id, object: "event", type, data: { object } });
    const signature = signer.webhooks.generateTestHeaderString({ payload: body, secret: valid ? secret : "wrong_secret" });
    return webhook.POST(new NextRequest("http://localhost/api/webhooks/stripe-billing", {
      method: "POST", body, headers: { "stripe-signature": signature },
    }));
  }

  function invoice() {
    return { id: invoiceId, parent: { subscription_details: { subscription: subscriptionId } }, currency: "eur", amount_paid: 7900, total_excluding_tax: 7900 };
  }

  beforeAll(async () => {
    database = await configureIntegrationDatabase();
    previousAdminEmails = process.env.ADMIN_EMAILS;
    previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.ADMIN_EMAILS = "";
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    await seedIdentity(database, { id: ownerId, email: `billing-owner-${suffix}@example.test` });
    await seedIdentity(database, { id: memberId, email: `billing-member-${suffix}@example.test` });
    await seedIdentity(database, { id: inviteeId, email: `billing-invitee-${suffix}@example.test` });
    await database.insert(businesses).values([
      { id: businessId, ownerUserId: ownerId, name: "Billing fixture A", isInitial: false, status: "pending" },
      { id: otherBusinessId, ownerUserId: ownerId, name: "Billing fixture B", isInitial: true, status: "active", stripeCustomerId: `cus_other_${suffix}` },
    ]);
    await database.insert(subscriptionPlans).values({ id: planId, key: planKey, name: "Billing fixture plan", priceMonthlyCents: 7900, stripePriceId: `price_${suffix}`, features: { teamMembersEnabled: true, maxTeamMembers: 5 } });
    await database.insert(subscriptions).values({ userId: otherBusinessId, planId, stripeCustomerId: `cus_other_${suffix}`, stripeSubscriptionId: `sub_other_${suffix}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) });
    await database.insert(teamMembers).values({ accountId: businessId, memberUserId: memberId, email: `billing-member-${suffix}@example.test`, status: "active", invitedByUserId: ownerId });
    fake.constructEvent.mockImplementation(signer.webhooks.constructEvent.bind(signer.webhooks));
    webhook = await import("@/app/api/webhooks/stripe-billing/route");
    checkout = await import("@/app/api/billing/checkout/route");
    portal = await import("@/app/api/billing/portal/route");
    entitlement = await import("@/lib/businesses/entitlements");
    inviteActions = await import("@/app/invite/[token]/actions");
    onboardingActions = await import("@/app/onboarding/actions");
  }, 30_000);

  beforeEach(async () => {
    if (!database) return;
    await database.delete(subscriptions).where(eq(subscriptions.userId, businessId));
    await database.delete(teamMembers).where(and(eq(teamMembers.accountId, businessId), eq(teamMembers.email, `billing-invitee-${suffix}@example.test`)));
    await database.update(subscriptionPlans).set({ features: { teamMembersEnabled: true, maxTeamMembers: 5 } }).where(eq(subscriptionPlans.id, planId));
    await database.update(businesses).set({ status: "pending", stripeCustomerId: null, checkoutSessionId: null, checkoutSessionUrl: null, checkoutSessionExpiresAt: null }).where(eq(businesses.id, businessId));
    fake.actor = { userId: ownerId, email: `billing-owner-${suffix}@example.test` };
    fake.target = businessId;
    fake.canonical.clear();
    fake.customerCreate.mockReset().mockResolvedValue({ id: customerId });
    fake.checkoutCreate.mockReset().mockResolvedValue({ id: `cs_${suffix}`, url: `https://checkout.stripe.com/c/pay/${suffix}`, expires_at: Math.floor(Date.now() / 1000) + 1800 });
    fake.checkoutRetrieve.mockReset().mockResolvedValue({ id: `cs_${suffix}`, status: "open", url: `https://checkout.stripe.com/c/pay/${suffix}`, expires_at: Math.floor(Date.now() / 1000) + 1800 });
    fake.portalCreate.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/p/session/local_fixture" });
    fake.recovery.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (!database) return;
    for (const id of events) await database.delete(processedStripeEvents).where(eq(processedStripeEvents.id, id));
    await cleanupIdentityFixtures(database, [ownerId, memberId, inviteeId]);
    await database.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previousAdminEmails;
    if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  });

  it("blocks only the failed business and restores it only from a paid latest invoice", async () => {
    await seedSubscription();
    fake.canonical.set(subscriptionId, payload({ latest_invoice: { id: invoiceId, status: "open", paid: false, amount_remaining: 7900, attempt_count: 1 } }));
    const failedEvent = `evt_failed_${randomUUID()}`;
    expect((await deliver("invoice.payment_failed", invoice(), failedEvent)).status).toBe(200);
    expect((await entitlement.getBusinessEntitlement(businessId)).active).toBe(false);
    expect((await entitlement.getBusinessEntitlement(otherBusinessId)).active).toBe(true);
    const [blocked] = await database.select().from(subscriptions).where(eq(subscriptions.userId, businessId));
    expect(blocked.paymentBlockedAt).toBeInstanceOf(Date);
    expect((await deliver("invoice.payment_failed", invoice(), failedEvent)).status).toBe(200);
    expect(await database.select().from(processedStripeEvents).where(eq(processedStripeEvents.id, failedEvent))).toHaveLength(1);
    fake.canonical.set(subscriptionId, payload());
    expect((await deliver("invoice.paid", invoice())).status).toBe(200);
    expect((await entitlement.getBusinessEntitlement(businessId)).active).toBe(true);
    const [recovered] = await database.select().from(subscriptions).where(eq(subscriptions.userId, businessId));
    expect(recovered.paymentBlockedAt).toBeNull();
    expect(fake.recovery).toHaveBeenCalledWith(businessId);
    expect((await deliver("invoice.payment_failed", invoice())).status).toBe(200);
    expect((await entitlement.getBusinessEntitlement(businessId)).active).toBe(true);
  });

  it("keeps projection conflicts retryable with the same signed event", async () => {
    await seedSubscription();
    fake.canonical.set(subscriptionId, payload({ customer: "cus_wrong_business" }));
    const eventId = `evt_conflict_${randomUUID()}`;
    expect((await deliver("customer.subscription.updated", { id: subscriptionId }, eventId)).status).toBe(500);
    expect(await database.select().from(processedStripeEvents).where(eq(processedStripeEvents.id, eventId))).toHaveLength(0);
    fake.canonical.set(subscriptionId, payload());
    expect((await deliver("customer.subscription.updated", { id: subscriptionId }, eventId)).status).toBe(200);
    expect(await database.select().from(processedStripeEvents).where(eq(processedStripeEvents.id, eventId))).toHaveLength(1);
  });

  it("rejects an invalid signature before changing billing", async () => {
    fake.canonical.set(subscriptionId, payload());
    expect((await deliver("customer.subscription.created", { id: subscriptionId }, undefined, false)).status).toBe(400);
    expect(await database.select().from(subscriptions).where(eq(subscriptions.userId, businessId))).toHaveLength(0);
  });

  it("retries recovery after a failure between projection commit and event acknowledgement", async () => {
    await seedSubscription();
    await database.update(subscriptions).set({ status: "past_due", paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, businessId));
    fake.canonical.set(subscriptionId, payload());
    fake.recovery.mockRejectedValueOnce(new Error("fixture recovery unavailable"));
    const eventId = `evt_recovery_${randomUUID()}`;
    expect((await deliver("invoice.paid", invoice(), eventId)).status).toBe(500);
    expect((await entitlement.getBusinessEntitlement(businessId)).active).toBe(true);
    expect(await database.select().from(processedStripeEvents).where(eq(processedStripeEvents.id, eventId))).toHaveLength(0);
    expect((await deliver("invoice.paid", invoice(), eventId)).status).toBe(200);
    expect(fake.recovery).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent checkout attempts and never adds a trial to another business", async () => {
    const request = () => new NextRequest(`http://localhost/api/billing/checkout?business=${businessId}&plan=${planKey}&trial=7`);
    const results = await Promise.all([checkout.GET(request()), checkout.GET(request())]);
    expect(results.map((response) => response.headers.get("location"))).toEqual([`https://checkout.stripe.com/c/pay/${suffix}`, `https://checkout.stripe.com/c/pay/${suffix}`]);
    expect(fake.customerCreate).toHaveBeenCalledOnce();
    expect(fake.checkoutCreate).toHaveBeenCalledOnce();
    const parameters = fake.checkoutCreate.mock.calls[0]?.[0];
    expect(parameters.subscription_data.trial_period_days).toBeUndefined();
    expect(parameters.subscription_data.metadata.businessId).toBe(businessId);
    expect(parameters.success_url).toContain(`/b/${businessId}/settings/facturation`);
    const [stored] = await database.select().from(businesses).where(eq(businesses.id, businessId));
    expect(stored.checkoutSessionId).toBe(`cs_${suffix}`);
    expect(stored.stripeCustomerId).toBe(customerId);
    const [other] = await database.select().from(businesses).where(eq(businesses.id, otherBusinessId));
    expect(other.stripeCustomerId).toBe(`cus_other_${suffix}`);
  });

  it("routes an existing subscription to management without a second checkout", async () => {
    await seedSubscription();
    const response = await checkout.GET(new NextRequest(`http://localhost/api/billing/checkout?business=${businessId}&plan=${planKey}`));
    expect(response.headers.get("location")).toContain(`/api/billing/portal?business=${businessId}`);
    expect(fake.checkoutCreate).not.toHaveBeenCalled();
  });

  it("permits owner payment recovery while suspended and denies billing to a member", async () => {
    await seedSubscription();
    await database.update(subscriptions).set({ status: "past_due", paymentBlockedAt: new Date() }).where(eq(subscriptions.userId, businessId));
    const request = () => new NextRequest(`http://localhost/api/billing/portal?business=${businessId}`);
    expect((await portal.GET(request())).headers.get("location")).toBe("https://billing.stripe.com/p/session/local_fixture");
    expect(fake.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: customerId, return_url: expect.stringContaining(`/b/${businessId}/settings/facturation`) }));
    fake.actor = { userId: memberId, email: `billing-member-${suffix}@example.test` };
    expect((await portal.GET(request())).status).toBe(403);
    expect(fake.portalCreate).toHaveBeenCalledOnce();
    expect((await checkout.GET(new NextRequest(`http://localhost/api/billing/checkout?business=${businessId}&plan=${planKey}`))).status).toBe(403);
  });

  async function invitation(expiresAt = new Date(Date.now() + 86_400_000)) {
    const token = randomUUID().replaceAll("-", "");
    await database.insert(teamMembers).values({ accountId: businessId, email: `billing-invitee-${suffix}@example.test`, status: "invited", inviteToken: token, inviteExpiresAt: expiresAt, invitedByUserId: ownerId });
    fake.actor = { userId: inviteeId, email: `billing-invitee-${suffix}@example.test` };
    return token;
  }

  it("checks current team capacity when an invitation is accepted", async () => {
    await seedSubscription();
    const token = await invitation();
    await database.update(subscriptionPlans).set({ features: { teamMembersEnabled: true, maxTeamMembers: 1 } }).where(eq(subscriptionPlans.id, planId));
    expect(await inviteActions.acceptInvite(token)).toMatchObject({ error: "limitReached" });
    const [row] = await database.select().from(teamMembers).where(eq(teamMembers.inviteToken, token));
    expect(row.status).toBe("invited");
    expect(row.memberUserId).toBeNull();
  });

  it("rejects an invite while the host is suspended and allows the same token after payment recovery", async () => {
    await seedSubscription();
    const token = await invitation();
    await database.update(subscriptions).set({ status: "past_due" }).where(eq(subscriptions.userId, businessId));
    expect(await inviteActions.acceptInvite(token)).toMatchObject({ error: "unavailable" });
    await database.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.userId, businessId));
    const accepted = await inviteActions.acceptInvite(token);
    expect(accepted.error).toBeNull();
    expect(accepted.redirectTo).toContain(`/b/${businessId}/`);
  });

  it("rejects expired and revoked invitations without activating membership", async () => {
    await seedSubscription();
    const token = await invitation(new Date(Date.now() - 1000));
    expect(await inviteActions.acceptInvite(token)).toMatchObject({ error: "invalidHelp" });
    await database.update(teamMembers).set({ inviteExpiresAt: new Date(Date.now() + 86_400_000), status: "removed" }).where(eq(teamMembers.inviteToken, token));
    expect(await inviteActions.acceptInvite(token)).toMatchObject({ error: "invalidHelp" });
    const [row] = await database.select().from(teamMembers).where(eq(teamMembers.inviteToken, token));
    expect(row.status).toBe("removed");
    expect(row.memberUserId).toBeNull();
  });

  it("finishes onboarding only for the selected business", async () => {
    await seedSubscription();
    await database.update(businesses).set({ onboardingCompleted: false }).where(eq(businesses.ownerUserId, ownerId));
    await expect(onboardingActions.skipOnboarding()).rejects.toThrow(`TEST_REDIRECT:/b/${businessId}/roadmap`);
    const [selected] = await database.select().from(businesses).where(eq(businesses.id, businessId));
    const [other] = await database.select().from(businesses).where(eq(businesses.id, otherBusinessId));
    expect(selected.onboardingCompleted).toBe(true);
    expect(other.onboardingCompleted).toBe(false);
  });
});
