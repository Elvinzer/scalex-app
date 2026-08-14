import type { Platform } from "./types";

export type ConnectedPlatformPrefill = {
  name: "Instagram" | "YouTube";
  url: string;
};

export function mergeConnectedPlatformPrefills(
  platforms: Platform[],
  prefills: readonly ConnectedPlatformPrefill[],
): { platforms: Platform[]; changed: boolean } {
  const next = platforms.map((platform) => ({ ...platform }));
  let changed = false;

  for (const prefill of prefills) {
    const existing = next.find((platform) => platform.name === prefill.name);
    if (!existing) {
      next.push({ name: prefill.name, url: prefill.url, postsPerWeek: null });
      changed = true;
      continue;
    }

    if (existing.url.trim() === "" && prefill.url !== "") {
      existing.url = prefill.url;
      changed = true;
    }
  }

  return { platforms: next, changed };
}
