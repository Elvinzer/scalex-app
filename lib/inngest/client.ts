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

export const inngest = new Inngest({ id: "scale-x" });
