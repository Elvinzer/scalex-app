import { describe, expect, it } from "vitest";

import { MetaApiError } from "./client";
import { isMetaTokenExpiredError, metaConnectionFailureStatus, metaSyncErrorMessage } from "./sync-state";

describe("Meta Ads sync failure state", () => {
  it("classifies expired tokens before generic failures", () => {
    const error = new MetaApiError("Token expired", { code: 190 });

    expect(metaConnectionFailureStatus(error)).toBe("token_expired");
    expect(isMetaTokenExpiredError(error)).toBe(true);
    expect(metaSyncErrorMessage(error)).toBe("Token expired");
  });

  it("keeps permission and account failures actionable", () => {
    expect(metaConnectionFailureStatus(new MetaApiError("Denied", { code: 200 }))).toBe("permission_revoked");
    expect(metaConnectionFailureStatus(new Error("Le compte n'est plus accessible en lecture."))).toBe("account_inaccessible");
    expect(metaConnectionFailureStatus(new Error("network"))).toBe("connected");
    expect(isMetaTokenExpiredError(new Error("Token expired"))).toBe(false);
  });
});
