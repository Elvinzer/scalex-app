import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/team/context", () => ({ getAccountContext: vi.fn() }));

import { getNativeBookingViewer, viewerCloserIds } from "./access";
import { getAccountContext } from "@/lib/team/context";

const mockedGetAccountContext = vi.mocked(getAccountContext);

describe("native booking viewer scope", () => {
  it("keeps an owner account-wide while preserving requested filters", async () => {
    mockedGetAccountContext.mockResolvedValue({ isOwner: true, accountId: "account-owner", permissions: "all", advancedModulesEnabled: true });
    const viewer = await getNativeBookingViewer("account-owner");

    expect(viewer).toMatchObject({ userId: "account-owner", accountId: "account-owner", isAccountWide: true });
    expect(viewer && viewerCloserIds(viewer, ["closer-a", "closer-b"])).toEqual(["closer-a", "closer-b"]);
  });

  it("forces a delegated member to their own closer scope", async () => {
    mockedGetAccountContext.mockResolvedValue({ isOwner: false, accountId: "account-owner", permissions: new Set(["ventes:rdv"]), advancedModulesEnabled: true });
    const viewer = await getNativeBookingViewer("closer-a");

    expect(viewer).toMatchObject({ userId: "closer-a", accountId: "account-owner", isAccountWide: false });
    expect(viewer && viewerCloserIds(viewer, ["closer-b"])).toEqual(["closer-a"]);
  });
});
