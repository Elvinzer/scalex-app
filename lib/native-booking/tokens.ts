import { createHash, randomBytes } from "node:crypto";

export function createBookingManagementTokens() {
  const cancellationToken = randomBytes(24).toString("hex");
  const rescheduleToken = randomBytes(24).toString("hex");
  return {
    cancellationToken,
    rescheduleToken,
    cancellationTokenHash: hashBookingManagementToken(cancellationToken),
    rescheduleTokenHash: hashBookingManagementToken(rescheduleToken),
  };
}

export function hashBookingManagementToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
