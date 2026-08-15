import { describe, expect, it } from "vitest";

import { supportAttachmentSchema, supportTicketInputSchema } from "@/lib/support/validation";

describe("support ticket validation", () => {
  it("accepts structured ticket data", () => {
    expect(
      supportTicketInputSchema.safeParse({
        idempotencyKey: "00000000-0000-4000-8000-000000000000",
        type: "bug",
        title: "The export does not download",
        description: "Clicking export does not start a download.",
        pathname: "/diagnostic-app",
        locale: "en",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid idempotency key and unsupported ticket type", () => {
    expect(
      supportTicketInputSchema.safeParse({
        idempotencyKey: "not-a-uuid",
        type: "incident",
        title: "Bad",
        description: "Too short",
        pathname: "/dashboard",
        locale: "fr",
      }).success
    ).toBe(false);
  });

  it("limits captures to approved image types and size", () => {
    expect(supportAttachmentSchema.safeParse({ mimeType: "image/png", size: 1_024 }).success).toBe(true);
    expect(supportAttachmentSchema.safeParse({ mimeType: "application/pdf", size: 1_024 }).success).toBe(false);
  });
});
