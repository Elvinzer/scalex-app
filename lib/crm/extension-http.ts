const CRM_EXTENSION_MAX_BODY_BYTES = 16 * 1024;

export async function readCrmExtensionBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; reason: "too_large" | "invalid_json" }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > CRM_EXTENSION_MAX_BODY_BYTES) return { ok: false, reason: "too_large" };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > CRM_EXTENSION_MAX_BODY_BYTES) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
