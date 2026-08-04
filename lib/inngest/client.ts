import { eventType, Inngest, staticSchema } from "inngest";

type StripeAccountConnected = {
  userId: string;
};

export const stripeAccountConnected = eventType("stripe/account.connected", {
  schema: staticSchema<StripeAccountConnected>(),
});

type IclosedAccountConnected = {
  userId: string;
};

export const iclosedAccountConnected = eventType("iclosed/account.connected", {
  schema: staticSchema<IclosedAccountConnected>(),
});

type CalendlyAccountConnected = {
  userId: string;
};

export const calendlyAccountConnected = eventType("calendly/account.connected", {
  schema: staticSchema<CalendlyAccountConnected>(),
});

type InstagramAccountConnected = {
  userId: string;
};

export const instagramAccountConnected = eventType("instagram/account.connected", {
  schema: staticSchema<InstagramAccountConnected>(),
});

type InstagramBackfillContinue = {
  userId: string;
};

// Self-chained follow-up when backfillInstagramPosts stops early because it
// hit its time budget (see lib/instagram/protocol.ts's
// INSTAGRAM_BACKFILL_TIME_BUDGET_MS) — a large never-synced backlog can
// need several of these before fully catching up. Deliberately a distinct
// event from instagramAccountConnected: that one also flips
// initialSyncStatus through its own pending/completed/failed lifecycle,
// which a mid-backlog continuation has no business touching.
export const instagramBackfillContinue = eventType("instagram/backfill.continue", {
  schema: staticSchema<InstagramBackfillContinue>(),
});

export const inngest = new Inngest({ id: "scale-x" });
