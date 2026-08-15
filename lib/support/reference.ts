export function createSupportTicketReference(): string {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `MNL-${suffix}`;
}

