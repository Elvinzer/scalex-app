import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  youtubeCardMetrics,
  youtubeEndScreenMetrics,
  youtubeReportingJobs,
  youtubeReportingReports,
  youtubeVideoInsights,
  youtubeVideoSnapshots,
} from "@/db/schema";

import {
  YOUTUBE_REPORTING_API_BASE,
  YOUTUBE_REPORTING_REPORT_TYPES,
} from "./protocol";

const reportTypeSchema = z.object({
  id: z.string().min(1),
  systemManaged: z.boolean().optional(),
});

const reportTypesResponseSchema = z.object({
  reportTypes: z.array(reportTypeSchema).optional(),
});

const jobSchema = z.object({
  id: z.string().min(1),
  reportTypeId: z.string().min(1),
});

const jobsResponseSchema = z.object({
  jobs: z.array(jobSchema).optional(),
});

const reportSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  createTime: z.string().min(1),
  downloadUrl: z.string().url(),
});

const reportsResponseSchema = z.object({
  reports: z.array(reportSchema).optional(),
});

type CsvRow = Record<string, string>;

const REPORTING_TIMEOUT_MS = 45_000;
const MAX_REPORTS_PER_JOB_PER_SYNC = 14;

export type YoutubeReportingSyncResult = {
  scheduled: number;
  downloaded: number;
  rows: number;
  skipped: number;
};

function asInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function asReal(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/u.test(value)) return null;
  return value.slice(0, 10);
}

function normalizeClickRate(value: string | undefined): number | null {
  const parsed = asReal(value);
  if (parsed === null) return null;
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

async function reportingJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORTING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) throw new Error(`YouTube Reporting request failed (status ${response.status})`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function reportingRequest(accessToken: string, url: URL, init: RequestInit = {}): Promise<unknown> {
  return reportingJson(url, {
    ...init,
    headers: { ...authHeaders(accessToken), ...init.headers },
  });
}

function parseCsvRows(csv: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(csv, { header: true, skipEmptyLines: true });
  return parsed.data.filter((row): row is CsvRow => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    return Object.values(row).some((value) => typeof value === "string" && value.trim() !== "");
  });
}

async function downloadReport(accessToken: string, downloadUrl: string): Promise<CsvRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORTING_TIMEOUT_MS);
  try {
    const response = await fetch(downloadUrl, {
      headers: { ...authHeaders(accessToken), "Accept-Encoding": "gzip" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`YouTube Reporting download failed (status ${response.status})`);
    return parseCsvRows(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function availableReportTypes(accessToken: string): Promise<Set<string>> {
  const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/reportTypes`);
  url.searchParams.set("pageSize", "1000");
  const parsed = reportTypesResponseSchema.safeParse(await reportingRequest(accessToken, url));
  if (!parsed.success) return new Set();
  return new Set(
    (parsed.data.reportTypes ?? [])
      .filter((item) => item.systemManaged !== true)
      .map((item) => item.id)
  );
}

async function listRemoteJobs(accessToken: string): Promise<Map<string, string>> {
  const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs`);
  url.searchParams.set("pageSize", "1000");
  const parsed = jobsResponseSchema.safeParse(await reportingRequest(accessToken, url));
  if (!parsed.success) return new Map();
  return new Map((parsed.data.jobs ?? []).map((job) => [job.reportTypeId, job.id]));
}

async function ensureJobs(userId: string, channelId: string, accessToken: string): Promise<typeof youtubeReportingJobs.$inferSelect[]> {
  const [available, remoteJobs] = await Promise.all([
    availableReportTypes(accessToken),
    listRemoteJobs(accessToken),
  ]);
  const localRows: typeof youtubeReportingJobs.$inferSelect[] = [];

  for (const reportTypeId of YOUTUBE_REPORTING_REPORT_TYPES) {
    if (!available.has(reportTypeId)) continue;
    let jobId = remoteJobs.get(reportTypeId);
    if (!jobId) {
      try {
        const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs`);
        const created = await reportingRequest(accessToken, url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportTypeId, name: `Minaly ${reportTypeId}` }),
        });
        const parsed = jobSchema.safeParse(created);
        jobId = parsed.success ? parsed.data.id : undefined;
      } catch (error) {
        console.error(`[youtube] reporting job ${reportTypeId} could not be scheduled`, error);
      }
    }
    if (!jobId) continue;

    const [row] = await db
      .insert(youtubeReportingJobs)
      .values({ userId, channelId, reportTypeId, jobId, status: "active", updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [youtubeReportingJobs.userId, youtubeReportingJobs.reportTypeId],
        set: { channelId, jobId, status: "active", lastError: null, updatedAt: new Date() },
      })
      .returning();
    if (row) localRows.push(row);
  }
  return localRows;
}

function rowVideoId(row: CsvRow): string | null {
  const value = row.video_id?.trim();
  return value ? value : null;
}

async function importReachRows(userId: string, rows: CsvRow[]): Promise<number> {
  let imported = 0;
  for (const row of rows) {
    const videoId = rowVideoId(row);
    const capturedOn = asDate(row.date);
    if (!videoId || !capturedOn) continue;
    const impressions = asInteger(row.video_thumbnail_impressions);
    const clickRate = normalizeClickRate(row.video_thumbnail_impressions_ctr);
    await db
      .insert(youtubeVideoSnapshots)
      .values({ userId, videoId, capturedOn, impressions, impressionsClickThroughRate: clickRate })
      .onConflictDoUpdate({
        target: [youtubeVideoSnapshots.userId, youtubeVideoSnapshots.videoId, youtubeVideoSnapshots.capturedOn],
        set: { impressions, impressionsClickThroughRate: clickRate },
      });
    await db
      .update(youtubeVideoInsights)
      .set({ impressions, impressionsClickThroughRate: clickRate })
      .where(and(eq(youtubeVideoInsights.userId, userId), eq(youtubeVideoInsights.videoId, videoId)));
    imported += 1;
  }
  return imported;
}

async function importEndScreenRows(userId: string, rows: CsvRow[]): Promise<number> {
  let imported = 0;
  for (const row of rows) {
    const videoId = rowVideoId(row);
    const capturedOn = asDate(row.date);
    const elementType = row.end_screen_element_type?.trim();
    const elementId = row.end_screen_element_id?.trim() || "unknown";
    if (!videoId || !capturedOn || !elementType) continue;
    await db
      .insert(youtubeEndScreenMetrics)
      .values({
        userId,
        videoId,
        capturedOn,
        elementType,
        elementId,
        impressions: asInteger(row.end_screen_element_impressions),
        clicks: asInteger(row.end_screen_element_clicks),
        clickRate: normalizeClickRate(row.end_screen_element_click_rate),
        rawRow: row,
      })
      .onConflictDoUpdate({
        target: [youtubeEndScreenMetrics.userId, youtubeEndScreenMetrics.videoId, youtubeEndScreenMetrics.capturedOn, youtubeEndScreenMetrics.elementType, youtubeEndScreenMetrics.elementId],
        set: {
          impressions: asInteger(row.end_screen_element_impressions),
          clicks: asInteger(row.end_screen_element_clicks),
          clickRate: normalizeClickRate(row.end_screen_element_click_rate),
          rawRow: row,
        },
      });
    imported += 1;
  }
  return imported;
}

async function importCardRows(userId: string, rows: CsvRow[]): Promise<number> {
  let imported = 0;
  for (const row of rows) {
    const videoId = rowVideoId(row);
    const capturedOn = asDate(row.date);
    const cardType = row.card_type?.trim();
    const cardId = row.card_id?.trim() || "unknown";
    if (!videoId || !capturedOn || !cardType) continue;
    await db
      .insert(youtubeCardMetrics)
      .values({
        userId,
        videoId,
        capturedOn,
        cardType,
        cardId,
        impressions: asInteger(row.card_impressions),
        clicks: asInteger(row.card_clicks),
        clickRate: normalizeClickRate(row.card_click_rate),
        teaserImpressions: asInteger(row.card_teaser_impressions),
        teaserClicks: asInteger(row.card_teaser_clicks),
        rawRow: row,
      })
      .onConflictDoUpdate({
        target: [youtubeCardMetrics.userId, youtubeCardMetrics.videoId, youtubeCardMetrics.capturedOn, youtubeCardMetrics.cardType, youtubeCardMetrics.cardId],
        set: {
          impressions: asInteger(row.card_impressions),
          clicks: asInteger(row.card_clicks),
          clickRate: normalizeClickRate(row.card_click_rate),
          teaserImpressions: asInteger(row.card_teaser_impressions),
          teaserClicks: asInteger(row.card_teaser_clicks),
          rawRow: row,
        },
      });
    imported += 1;
  }
  return imported;
}

async function importRows(userId: string, reportTypeId: string, rows: CsvRow[]): Promise<number> {
  if (reportTypeId === "channel_reach_basic_a1") return importReachRows(userId, rows);
  if (reportTypeId === "channel_end_screens_a2") return importEndScreenRows(userId, rows);
  if (reportTypeId === "channel_cards_a1") return importCardRows(userId, rows);
  return 0;
}

export async function syncYoutubeReporting(
  userId: string,
  channelId: string,
  accessToken: string,
): Promise<YoutubeReportingSyncResult> {
  const jobs = await ensureJobs(userId, channelId, accessToken);
  const existingReports = await db
    .select({ reportId: youtubeReportingReports.reportId, downloadedAt: youtubeReportingReports.downloadedAt })
    .from(youtubeReportingReports)
    .where(eq(youtubeReportingReports.userId, userId));
  const downloadedReportIds = new Set(existingReports.filter((row) => row.downloadedAt !== null).map((row) => row.reportId));
  let downloaded = 0;
  let rowsImported = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs/${encodeURIComponent(job.jobId)}/reports`);
      url.searchParams.set("pageSize", "100");
      const parsed = reportsResponseSchema.safeParse(await reportingRequest(accessToken, url));
      if (!parsed.success) continue;
      const reports = (parsed.data.reports ?? [])
        .filter((report) => !downloadedReportIds.has(report.id))
        .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
        .slice(-MAX_REPORTS_PER_JOB_PER_SYNC);

      for (const report of reports) {
        try {
          const rows = await downloadReport(accessToken, report.downloadUrl);
          rowsImported += await importRows(userId, job.reportTypeId, rows);
          await db
            .insert(youtubeReportingReports)
            .values({
              userId,
              jobId: report.jobId,
              reportId: report.id,
              reportTypeId: job.reportTypeId,
              startTime: new Date(report.startTime),
              endTime: new Date(report.endTime),
              createTime: new Date(report.createTime),
              downloadedAt: new Date(),
              rowCount: rows.length,
            })
            .onConflictDoUpdate({
              target: [youtubeReportingReports.userId, youtubeReportingReports.reportId],
              set: { downloadedAt: new Date(), rowCount: rows.length },
            });
          downloaded += 1;
          downloadedReportIds.add(report.id);
        } catch (error) {
          skipped += 1;
          console.error(`[youtube] reporting import ${job.reportTypeId} failed`, error);
        }
      }

      const newest = reports.at(-1);
      await db
        .update(youtubeReportingJobs)
        .set({
          lastReportStartAt: newest ? new Date(newest.startTime) : job.lastReportStartAt,
          lastSyncedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(youtubeReportingJobs.userId, userId), eq(youtubeReportingJobs.jobId, job.jobId)));
    } catch (error) {
      skipped += 1;
      console.error(`[youtube] reporting job ${job.reportTypeId} failed`, error);
      await db
        .update(youtubeReportingJobs)
        .set({ lastError: "YouTube Reporting import failed", updatedAt: new Date() })
        .where(and(eq(youtubeReportingJobs.userId, userId), eq(youtubeReportingJobs.jobId, job.jobId)));
    }
  }

  return { scheduled: jobs.length, downloaded, rows: rowsImported, skipped };
}
