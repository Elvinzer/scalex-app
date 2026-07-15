import { eventType, Inngest, staticSchema } from "inngest";

type StripeAccountConnected = {
  userId: string;
};

export const stripeAccountConnected = eventType("stripe/account.connected", {
  schema: staticSchema<StripeAccountConnected>(),
});

export const inngest = new Inngest({ id: "scale-x" });
