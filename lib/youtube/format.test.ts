import { describe, expect, it } from "vitest";

import { matchesFormat, resolveVideoFormat } from "./format";

describe("YouTube video format", () => {
  it("prefers the Analytics content type when it exists", () => {
    expect(resolveVideoFormat({ durationSeconds: 600, creatorContentType: "SHORTS" })).toBe("short");
    expect(resolveVideoFormat({ durationSeconds: 40, creatorContentType: "VIDEO_ON_DEMAND" })).toBe("long");
  });

  it("keeps old rows filterable with a duration fallback", () => {
    expect(resolveVideoFormat({ durationSeconds: 90, creatorContentType: null })).toBe("short");
    expect(resolveVideoFormat({ durationSeconds: 600, creatorContentType: null })).toBe("long");
    expect(matchesFormat({ durationSeconds: null, creatorContentType: null }, "short")).toBe(false);
  });
});
