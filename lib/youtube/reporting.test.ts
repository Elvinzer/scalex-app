import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, state } = vi.hoisted(() => ({
  dbMock: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  state: {
    existingReports: [] as Array<{ reportId: string; downloadedAt: Date | null; reportTypeId: string; endTime: Date }>,
    snapshots: [] as Array<{ videoId: string; capturedOn: string; impressions: number | null; impressionsClickThroughRate: number | null }>,
    videos: [] as Array<{
      videoId: string;
      publishedAt: Date;
      impressions: number | null;
      impressionsClickThroughRate: number | null;
      reachStatus: "pending" | "available" | "historically_unavailable";
    }>,
    inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    remoteJobExists: false,
  },
}));

vi.mock("@/db", () => ({ db: dbMock }));

import {
  youtubeReportingJobs,
  youtubeReportingReports,
  youtubeVideoInsights,
  youtubeVideoSnapshots,
} from "@/db/schema";
import { syncYoutubeReporting } from "./reporting";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function csvResponse(value: string): Response {
  return new Response(value, { status: 200, headers: { "Content-Type": "text/csv" } });
}

describe("YouTube Reporting synchronization", () => {
  beforeEach(() => {
    state.existingReports = [];
    state.videos = [
      {
        videoId: "video-1",
        publishedAt: new Date("2026-09-19T12:00:00Z"),
        impressions: null,
        impressionsClickThroughRate: null,
        reachStatus: "pending",
      },
    ];
    state.snapshots = [];
    state.inserts = [];
    state.updates = [];
    state.remoteJobExists = false;

    dbMock.insert.mockImplementation((table: unknown) => ({
      values: (values: unknown) => {
        const normalizedValues = values && typeof values === "object" ? Object.fromEntries(Object.entries(values)) : {};
        state.inserts.push({ table, values: normalizedValues });
        if (table === youtubeReportingReports && typeof normalizedValues.reportId === "string") {
          state.existingReports.push({
            reportId: normalizedValues.reportId,
            downloadedAt: new Date(),
            reportTypeId: typeof normalizedValues.reportTypeId === "string" ? normalizedValues.reportTypeId : "",
            endTime: normalizedValues.endTime instanceof Date ? normalizedValues.endTime : new Date(),
          });
        }
        if (table === youtubeVideoSnapshots && typeof normalizedValues.videoId === "string") {
          const existing = state.snapshots.find((snapshot) => snapshot.videoId === normalizedValues.videoId && snapshot.capturedOn === normalizedValues.capturedOn);
          const snapshot = {
            videoId: normalizedValues.videoId,
            capturedOn: typeof normalizedValues.capturedOn === "string" ? normalizedValues.capturedOn : "",
            impressions: typeof normalizedValues.impressions === "number" ? normalizedValues.impressions : null,
            impressionsClickThroughRate: typeof normalizedValues.impressionsClickThroughRate === "number" ? normalizedValues.impressionsClickThroughRate : null,
          };
          if (existing) Object.assign(existing, snapshot);
          else state.snapshots.push(snapshot);
        }
        return {
          onConflictDoUpdate: () => {
            if (table === youtubeReportingJobs) {
              return {
                returning: async () => [
                  {
                    userId: "user-1",
                    reportTypeId: "channel_reach_basic_a1",
                    jobId: "job-reach",
                    remoteCreatedAt: new Date("2026-09-01T00:00:00Z"),
                    lastReportStartAt: null,
                    status: "active",
                    lastError: null,
                  },
                ],
              };
            }
            return Promise.resolve();
          },
        };
      },
    }));

    dbMock.select.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: async () => table === youtubeReportingReports
          ? state.existingReports
          : table === youtubeVideoSnapshots
            ? state.snapshots
            : state.videos,
      }),
    }));

    dbMock.update.mockImplementation((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          const normalizedValues = values && typeof values === "object" ? Object.fromEntries(Object.entries(values)) : {};
          state.updates.push({ table, values: normalizedValues });
          if (table === youtubeVideoInsights) {
            for (const video of state.videos) Object.assign(video, normalizedValues);
          }
        },
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates the reach job, follows report pages, imports CSV rows, and persists them", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/reportTypes")) {
        return Promise.resolve(jsonResponse({ reportTypes: [{ id: "channel_reach_basic_a1" }] }));
      }
      if (url.pathname.endsWith("/jobs") && init?.method !== "POST") {
        return Promise.resolve(jsonResponse({
          jobs: state.remoteJobExists
            ? [{ id: "job-reach", reportTypeId: "channel_reach_basic_a1", createTime: "2026-09-01T00:00:00Z" }]
            : [],
        }));
      }
      if (url.pathname.endsWith("/jobs") && init?.method === "POST") {
        state.remoteJobExists = true;
        return Promise.resolve(jsonResponse({ id: "job-reach", reportTypeId: "channel_reach_basic_a1", createTime: "2026-09-01T00:00:00Z" }));
      }
      if (url.pathname.endsWith("/reports") && url.searchParams.get("pageToken") === null) {
        return Promise.resolve(jsonResponse({
          reports: [{
            id: "report-1",
            jobId: "job-reach",
            startTime: "2026-09-19T00:00:00Z",
            endTime: "2026-09-20T00:00:00Z",
            createTime: "2026-09-21T00:00:00Z",
            downloadUrl: "https://download.test/report-1",
          }],
          nextPageToken: "page-2",
        }));
      }
      if (url.pathname.endsWith("/reports") && url.searchParams.get("pageToken") === "page-2") {
        return Promise.resolve(jsonResponse({
          reports: [{
            id: "report-2",
            jobId: "job-reach",
            startTime: "2026-09-20T00:00:00Z",
            endTime: "2026-09-21T00:00:00Z",
            createTime: "2026-09-22T00:00:00Z",
            downloadUrl: "https://download.test/report-2",
          }],
        }));
      }
      if (url.href === "https://download.test/report-1") {
        return Promise.resolve(csvResponse("date,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-09-19,video-1,1200,6.5\n"));
      }
      if (url.href === "https://download.test/report-2") {
        return Promise.resolve(csvResponse("date,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-09-20,video-1,1300,7.5\n"));
      }
      return Promise.reject(new Error(`Unexpected YouTube Reporting URL: ${url.href}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncYoutubeReporting("user-1", "channel-1", "access-token");

    expect(result).toMatchObject({
      scheduled: 1,
      downloaded: 2,
      rows: 2,
      skipped: 0,
      status: "completed",
      reachJobConfigured: true,
      reachReportsAvailable: true,
      reachPending: 0,
      reachNeedsInvestigation: 0,
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("pageToken=page-2"))).toBe(true);
    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: youtubeVideoSnapshots,
        values: expect.objectContaining({ impressions: 1200, impressionsClickThroughRate: 6.5 }),
      }),
      expect.objectContaining({
        table: youtubeVideoSnapshots,
        values: expect.objectContaining({ impressions: 1300, impressionsClickThroughRate: 7.5 }),
      }),
      expect.objectContaining({
        table: youtubeReportingReports,
        values: expect.objectContaining({ reportId: "report-1" }),
      }),
      expect.objectContaining({
        table: youtubeReportingReports,
        values: expect.objectContaining({ reportId: "report-2" }),
      }),
    ]));
    expect(state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: youtubeVideoInsights,
        values: expect.objectContaining({ reachStatus: "available", impressions: 2500, impressionsClickThroughRate: expect.closeTo(7.02, 5) }),
      }),
    ]));

    const rerun = await syncYoutubeReporting("user-1", "channel-1", "access-token");
    expect(rerun).toMatchObject({ downloaded: 0, rows: 0, skipped: 0, status: "completed" });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("https://download.test/")).length).toBe(2);
  });

  it("keeps the UI state pending when the new job has no report yet", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/reportTypes")) {
        return Promise.resolve(jsonResponse({ reportTypes: [{ id: "channel_reach_basic_a1" }] }));
      }
      if (url.pathname.endsWith("/jobs") && init?.method !== "POST") return Promise.resolve(jsonResponse({ jobs: [] }));
      if (url.pathname.endsWith("/jobs") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: "job-reach", reportTypeId: "channel_reach_basic_a1", createTime: "2026-09-23T00:00:00Z" }));
      }
      if (url.pathname.endsWith("/reports")) return Promise.resolve(jsonResponse({ reports: [] }));
      return Promise.reject(new Error(`Unexpected YouTube Reporting URL: ${url.href}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncYoutubeReporting("user-1", "channel-1", "access-token");

    expect(result).toMatchObject({
      scheduled: 1,
      downloaded: 0,
      rows: 0,
      skipped: 0,
      status: "pending",
      reachJobConfigured: true,
      reachReportsAvailable: false,
      reachPending: 1,
      reachNeedsInvestigation: 0,
    });
    expect(state.inserts.some(({ table }) => table === youtubeVideoSnapshots)).toBe(false);
  });
});
