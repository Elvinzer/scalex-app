import { afterEach, describe, expect, it } from "vitest";

import { getEarlyAccessMode, isEarlyAccessMode } from "./early-access";

const originalMode = process.env.EARLY_ACCESS_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.EARLY_ACCESS_MODE;
  else process.env.EARLY_ACCESS_MODE = originalMode;
});

describe("early access mode", () => {
  it("fails closed when the setting is missing", () => {
    delete process.env.EARLY_ACCESS_MODE;

    expect(getEarlyAccessMode()).toBe("waitlist");
    expect(isEarlyAccessMode()).toBe(true);
  });

  it("only opens signups for the explicit open value", () => {
    process.env.EARLY_ACCESS_MODE = "open";
    expect(getEarlyAccessMode()).toBe("open");
    expect(isEarlyAccessMode()).toBe(false);

    process.env.EARLY_ACCESS_MODE = "OPEN";
    expect(getEarlyAccessMode()).toBe("waitlist");
  });
});
