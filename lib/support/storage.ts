export const SUPPORT_CAPTURE_BUCKET = "support-captures";
export const SUPPORT_CAPTURE_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_CAPTURE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type SupportCaptureMimeType = (typeof SUPPORT_CAPTURE_MIME_TYPES)[number];

export function isSupportCaptureMimeType(value: string): value is SupportCaptureMimeType {
  return (SUPPORT_CAPTURE_MIME_TYPES as readonly string[]).includes(value);
}

