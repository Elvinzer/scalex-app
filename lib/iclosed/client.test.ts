import { afterEach, describe, expect, it, vi } from "vitest";

import { listUpcomingCalls } from "./client";

describe("iClosed API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the UPCOMING event type for freshness checks", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            eventCalls: [{ id: 123, dateTimeUTC: "2026-08-13T11:00:00.000Z" }],
            count: 1,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const calls = await listUpcomingCalls("iclosed_test", 1, 100);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const requestInit = fetchMock.mock.calls[0]?.[1];

    expect(calls).toHaveLength(1);
    expect(calls[0]?.iclosedCallId).toBe("123");
    expect(requestUrl.searchParams.get("eventType")).toBe("UPCOMING");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
    expect(requestInit?.headers).toMatchObject({ Authorization: "Bearer iclosed_test" });
  });
});
