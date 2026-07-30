// Calendly API v2 constants (https://developer.calendly.com). REST, JSON,
// Bearer auth (Personal Access Token — BYOK, same model as iClosed/Anthropic).
//
// Confirmed:
//   - Base URL: https://api.calendly.com
//   - GET /users/me → { resource: { uri, current_organization, name, email } }
//   - GET /scheduled_events?user|organization=<uri>&count=100&status=&min_start_time=&
//         max_start_time=&sort=start_time:desc&page_token= → { collection[], pagination }
//   - GET /scheduled_events/{uuid}/invitees → { collection[{ name, email, status }] }
//   - POST /webhook_subscriptions { url, events, organization, user, scope, signing_key }
//         → { resource: { uri, signing_key } }   (real webhook API, unlike iClosed)
//   - Webhook signature header "Calendly-Webhook-Signature: t=<ts>,v1=<hmac>"
//         hmac = HMAC-SHA256( `${t}.${rawBody}`, signing_key )  (hex)

export const CALENDLY_API_BASE = "https://api.calendly.com";

export const CALENDLY_ENDPOINTS = {
  me: "/users/me",
  scheduledEvents: "/scheduled_events",
  webhookSubscriptions: "/webhook_subscriptions",
} as const;

// Booking lifecycle events we subscribe to. (invitee.canceled also fires on the
// old event when an invitee reschedules; the new time arrives as invitee.created.)
export const CALENDLY_WEBHOOK_EVENTS = ["invitee.created", "invitee.canceled"] as const;

export const CALENDLY_SIGNATURE_HEADER = "calendly-webhook-signature";
