import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), signOut: vi.fn(), deleteUser: vi.fn(), stripe: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "personal-actor" } } }), signOut: mocks.signOut } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }) }));
vi.mock("@/lib/stripe/platform-client", () => ({ getPlatformStripeClient: mocks.stripe }));
vi.mock("@/lib/team/context", () => ({ requireOwner: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => () => "Close your businesses first." }));
vi.mock("@/lib/revalidate-data", () => ({ revalidateBusinessData: vi.fn() }));

import { deleteAccount } from "./actions";

function rows(value: unknown[]) { return { from: () => ({ where: () => ({ limit: async () => value }) }) }; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteUser.mockResolvedValue({ error: null });
});

describe("personal identity deletion", () => {
  it("rejects an owner before signing out, cancelling billing or deleting the identity", async () => {
    mocks.select.mockReturnValueOnce(rows([{ id: "personal-actor", email: "owner@example.test" }])).mockReturnValueOnce(rows([{ id: "another-business" }]));
    expect(await deleteAccount("owner@example.test")).toEqual({ error: "Close your businesses first." });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("deletes the actor identity when they own no business", async () => {
    mocks.select.mockReturnValueOnce(rows([{ id: "personal-actor", email: "member@example.test" }])).mockReturnValueOnce(rows([]));
    expect(await deleteAccount("member@example.test")).toEqual({ error: null });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.deleteUser).toHaveBeenCalledWith("personal-actor");
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("validates the confirmation before external effects", async () => {
    mocks.select.mockReturnValueOnce(rows([{ id: "personal-actor", email: "owner@example.test" }]));
    expect((await deleteAccount(null as unknown as string)).error).toBeTruthy();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
