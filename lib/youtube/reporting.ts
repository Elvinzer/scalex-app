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
import { aggregateYoutubeReach, classifyYoutubeReach, hasYoutubeReachMetric, normalizeClickRate } from "./reach";

const reportTypeSchema = z.object({
  id: z.string().min(1),
  systemManaged: z.boolean().optional(),
});

const reportTypesResponseSchema = z.object({
  reportTypes: z.array(reportTypeSchema).optional(),
  nextPageToken: z.string().nullable().optional(),
});

const jobSchema = z.object({
  id: z.string().min(1),
  reportTypeId: z.string().min(1),
  createTime: z.string().min(1),
});

const jobsResponseSchema = z.object({
  jobs: z.array(jobSchema).optional(),
  nextPageToken: z.string().nullable().optional(),
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
  nextPageToken: z.string().nullable().optional(),
});

type CsvRow = Record<string, string>;

const csvRowSchema = z.record(z.string(), z.string());

const REPORTING_TIMEOUT_MS = 45_000;
const MAX_REPORTING_LIST_PAGES = 100;
// A newly-created reach job can include roughly 30 days of history. Keep
// enough headroom to ingest that first batch in one poll instead of leaving
// recent videos in an investigation state while older reports wait for a
// later sync.
const MAX_REPORTS_PER_JOB_PER_SYNC = 40;

export type YoutubeReportingSyncResult = {
  scheduled: number;
  downloaded: number;
  rows: number;
  skipped: number;
  status: "pending" | "completed" | "failed";
  reachJobConfigured: boolean;
  reachReportsAvailable: boolean;
  reachPending: number;
  reachNeedsInvestigation: number;
};

function asInteger(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function asDate(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}/u.test(normalized)) return null;
  return normalized.slice(0, 10);
}

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

export function parseYoutubeReportingCsv(csv: string): CsvRow[] {
  const parsed = Papa.parse<unknown>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/u, ""),
    transform: (value) => value.trim(),
  });
  return parsed.data.flatMap((row) => {
    const validated = csvRowSchema.safeParse(row);
    if (!validated.success) return [];
    return Object.values(validated.data).some((value) => value !== "") ? [validated.data] : [];
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
    return parseYoutubeReportingCsv(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function availableReportTypes(accessToken: string): Promise<Set<string>> {
  const available = new Set<string>();
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  for (let page = 0; page < MAX_REPORTING_LIST_PAGES; page += 1) {
    const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/reportTypes`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const parsed = reportTypesResponseSchema.safeParse(await reportingRequest(accessToken, url));
    if (!parsed.success) throw new Error("Invalid YouTube Reporting report types response");
    for (const reportType of parsed.data.reportTypes ?? []) {
      if (reportType.systemManaged !== true) available.add(reportType.id);
    }

    const nextPageToken = parsed.data.nextPageToken?.trim() || undefined;
    if (!nextPageToken) return available;
    if (seenPageTokens.has(nextPageToken)) throw new Error("YouTube Reporting report types pagination loop");
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  throw new Error("YouTube Reporting report types pagination exceeded the safety limit");
}

type RemoteReportingJob = {
  id: string;
  createTime: Date | null;
};

async function listRemoteJobs(accessToken: string): Promise<Map<string, RemoteReportingJob>> {
  const jobs = new Map<string, RemoteReportingJob>();
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  for (let page = 0; page < MAX_REPORTING_LIST_PAGES; page += 1) {
    const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const parsed = jobsResponseSchema.safeParse(await reportingRequest(accessToken, url));
    if (!parsed.success) throw new Error("Invalid YouTube Reporting jobs response");
    for (const job of parsed.data.jobs ?? []) {
      jobs.set(job.reportTypeId, { id: job.id, createTime: parseTimestamp(job.createTime) });
    }

    const nextPageToken = parsed.data.nextPageToken?.trim() || undefined;
    if (!nextPageToken) return jobs;
    if (seenPageTokens.has(nextPageToken)) throw new Error("YouTube Reporting jobs pagination loop");
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  throw new Error("YouTube Reporting jobs pagination exceeded the safety limit");
}

type RemoteReport = z.infer<typeof reportSchema>;

async function listRemoteReports(accessToken: string, jobId: string): Promise<RemoteReport[]> {
  const reports: RemoteReport[] = [];
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  for (let page = 0; page < MAX_REPORTING_LIST_PAGES; page += 1) {
    const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs/${encodeURIComponent(jobId)}/reports`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const parsed = reportsResponseSchema.safeParse(await reportingRequest(accessToken, url));
    if (!parsed.success) throw new Error("Invalid YouTube Reporting reports response");
    reports.push(...(parsed.data.reports ?? []));

    const nextPageToken = parsed.data.nextPageToken?.trim() || undefined;
    if (!nextPageToken) return reports;
    if (seenPageTokens.has(nextPageToken)) throw new Error("YouTube Reporting reports pagination loop");
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  throw new Error("YouTube Reporting reports pagination exceeded the safety limit");
}

async function ensureJobs(userId: string, channelId: string, accessToken: string): Promise<typeof youtubeReportingJobs.$inferSelect[]> {
  const [available, remoteJobs] = await Promise.all([
    availableReportTypes(accessToken),
    listRemoteJobs(accessToken),
  ]);
  const localRows: typeof youtubeReportingJobs.$inferSelect[] = [];

  for (const reportTypeId of YOUTUBE_REPORTING_REPORT_TYPES) {
    if (!available.has(reportTypeId)) continue;
    let remoteJob = remoteJobs.get(reportTypeId);
    if (!remoteJob) {
      try {
        const url = new URL(`${YOUTUBE_REPORTING_API_BASE}/jobs`);
        const created = await reportingRequest(accessToken, url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportTypeId, name: `Minaly ${reportTypeId}` }),
        });
        const parsed = jobSchema.safeParse(created);
        remoteJob = parsed.success
          ? { id: parsed.data.id, createTime: parseTimestamp(parsed.data.createTime) }
          : undefined;
      } catch (error) {
        console.error(`[youtube] reporting job ${reportTypeId} could not be scheduled`, error);
      }
    }
    if (!remoteJob) continue;

    const remoteCreatedAt = remoteJob.createTime;
    const updateValues = {
      channelId,
      jobId: remoteJob.id,
      status: "active",
      lastError: null,
      updatedAt: new Date(),
      ...(remoteCreatedAt ? { remoteCreatedAt } : {}),
    };

    const [row] = await db
      .insert(youtubeReportingJobs)
      .values({ userId, reportTypeId, ...updateValues })
      .onConflictDoUpdate({
        target: [youtubeReportingJobs.userId, youtubeReportingJobs.reportTypeId],
        set: updateValues,
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

    imported += 1;
  }

  return imported;
}

async function refreshReachInsights(userId: string): Promise<void> {
  const snapshots = await db
    .select({
      videoId: youtubeVideoSnapshots.videoId,
      impressions: youtubeVideoSnapshots.impressions,
      impressionsClickThroughRate: youtubeVideoSnapshots.impressionsClickThroughRate,
    })
    .from(youtubeVideoSnapshots)
    .where(eq(youtubeVideoSnapshots.userId, userId));
  const snapshotsByVideo = new Map<string, Array<{ impressions: number | null; impressionsClickThroughRate: number | null }>>();
  for (const snapshot of snapshots) {
    const current = snapshotsByVideo.get(snapshot.videoId) ?? [];
    current.push(snapshot);
    snapshotsByVideo.set(snapshot.videoId, current);
  }

  for (const [videoId, videoSnapshots] of snapshotsByVideo) {
    const aggregate = aggregateYoutubeReach(videoSnapshots);
    if (!hasYoutubeReachMetric(aggregate)) continue;
    await db
      .update(youtubeVideoInsights)
      .set({
        impressions: aggregate.impressions,
        impressionsClickThroughRate: aggregate.impressionsClickThroughRate,
        reachStatus: "available",
      })
      .where(and(eq(youtubeVideoInsights.userId, userId), eq(youtubeVideoInsights.videoId, videoId)));
  }
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
  if (reportTypeId === "channel_cards_a2") return importCardRows(userId, rows);
  return 0;
}

type ReachStatusSummary = {
  pending: number;
  needsInvestigation: number;
};

async function updateReachStatuses(
  userId: string,
  reachJob: typeof youtubeReportingJobs.$inferSelect | undefined,
  reportsAvailable: boolean,
  latestReportEndAt: Date | null,
): Promise<ReachStatusSummary> {
  const videos = await db
    .select({
      videoId: youtubeVideoInsights.videoId,
      publishedAt: youtubeVideoInsights.publishedAt,
      impressions: youtubeVideoInsights.impressions,
      impressionsClickThroughRate: youtubeVideoInsights.impressionsClickThroughRate,
      reachStatus: youtubeVideoInsights.reachStatus,
    })
    .from(youtubeVideoInsights)
    .where(eq(youtubeVideoInsights.userId, userId));

  let pending = 0;
  let needsInvestigation = 0;
  for (const video of videos) {
    const classification = classifyYoutubeReach({
      publishedAt: video.publishedAt,
      impressions: video.impressions,
      impressionsClickThroughRate: video.impressionsClickThroughRate,
      jobCreatedAt: reachJob?.remoteCreatedAt ?? null,
      latestReportEndAt,
      reportsAvailable,
    });
    if (classification.status === "pending") pending += 1;
    if (classification.needsInvestigation) needsInvestigation += 1;
    if (classification.status === video.reachStatus) continue;

    await db
      .update(youtubeVideoInsights)
      .set({ reachStatus: classification.status })
      .where(and(eq(youtubeVideoInsights.userId, userId), eq(youtubeVideoInsights.videoId, video.videoId)));
  }

  return { pending, needsInvestigation };
}

export async function syncYoutubeReporting(
  userId: string,
  channelId: string,
  accessToken: string,
): Promise<YoutubeReportingSyncResult> {
  const jobs = await ensureJobs(userId, channelId, accessToken);
  const existingReports = await db
    .select({
      reportId: youtubeReportingReports.reportId,
      downloadedAt: youtubeReportingReports.downloadedAt,
      reportTypeId: youtubeReportingReports.reportTypeId,
      endTime: youtubeReportingReports.endTime,
    })
    .from(youtubeReportingReports)
    .where(eq(youtubeReportingReports.userId, userId));
  const downloadedReportIds = new Set(existingReports.filter((row) => row.downloadedAt !== null).map((row) => row.reportId));
  const localReachReports = existingReports.filter((row) => row.reportTypeId === "channel_reach_basic_a1");
  let reachReportsAvailable = localReachReports.length > 0;
  let latestReachReportEndAt = localReachReports.reduce<Date | null>(
    (latest, report) => (latest === null || report.endTime > latest ? report.endTime : latest),
    null,
  );
  let downloaded = 0;
  let rowsImported = 0;
  let skipped = 0;
  let reachSkipped = 0;

  for (const job of jobs) {
    let jobSkipped = 0;
    try {
      const remoteReports = await listRemoteReports(accessToken, job.jobId);
      if (job.reportTypeId === "channel_reach_basic_a1" && remoteReports.length > 0) {
        reachReportsAvailable = true;
        for (const report of remoteReports) {
          const endTime = parseTimestamp(report.endTime);
          if (endTime && (latestReachReportEndAt === null || endTime > latestReachReportEndAt)) {
            latestReachReportEndAt = endTime;
          }
        }
      }
      const reports = remoteReports
        .filter((report) => !downloadedReportIds.has(report.id))
        .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
        // Drain the oldest pending reports first. Taking the newest slice
        // would starve an older report forever once a job has more reports
        // than the per-run safety cap.
        .slice(0, MAX_REPORTS_PER_JOB_PER_SYNC);

      for (const report of reports) {
        try {
          const startTime = parseTimestamp(report.startTime);
          const endTime = parseTimestamp(report.endTime);
          const createTime = parseTimestamp(report.createTime);
          if (!startTime || !endTime || !createTime) throw new Error("Invalid YouTube Reporting report timestamp");
          const rows = await downloadReport(accessToken, report.downloadUrl);
          rowsImported += await importRows(userId, job.reportTypeId, rows);
          await db
            .insert(youtubeReportingReports)
            .values({
              userId,
              jobId: report.jobId,
              reportId: report.id,
              reportTypeId: job.reportTypeId,
              startTime,
              endTime,
              createTime,
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
          jobSkipped += 1;
          if (job.reportTypeId === "channel_reach_basic_a1") reachSkipped += 1;
          console.error(`[youtube] reporting import ${job.reportTypeId} failed`, error);
        }
      }

      const newest = reports.at(-1);
      await db
        .update(youtubeReportingJobs)
        .set({
          lastReportStartAt: newest ? new Date(newest.startTime) : job.lastReportStartAt,
          lastSyncedAt: new Date(),
          lastError: jobSkipped > 0 ? "YouTube Reporting import failed" : null,
          updatedAt: new Date(),
        })
        .where(and(eq(youtubeReportingJobs.userId, userId), eq(youtubeReportingJobs.jobId, job.jobId)));
    } catch (error) {
      skipped += 1;
      jobSkipped += 1;
      if (job.reportTypeId === "channel_reach_basic_a1") reachSkipped += 1;
      console.error(`[youtube] reporting job ${job.reportTypeId} failed`, error);
      await db
        .update(youtubeReportingJobs)
        .set({ lastError: "YouTube Reporting import failed", updatedAt: new Date() })
        .where(and(eq(youtubeReportingJobs.userId, userId), eq(youtubeReportingJobs.jobId, job.jobId)));
    }
  }

  // Recompute from every stored daily reach snapshot on every poll. Besides
  // incorporating newly downloaded reports, this repairs current insight
  // values from reports imported by an earlier version of the importer.
  await refreshReachInsights(userId);

  const reachJob = jobs.find((job) => job.reportTypeId === "channel_reach_basic_a1");
  const reachSummary = await updateReachStatuses(userId, reachJob, reachReportsAvailable, latestReachReportEndAt);
  // A report can cover a video's publication date before YouTube includes a
  // row for that video. That is a data-availability state, not a failed
  // synchronization. Secondary reports are enrichment for other panels and
  // must not turn the reach metrics into an error state.
  const status =
    reachSkipped > 0 || !reachJob
      ? "failed"
      : !reachReportsAvailable
        ? "pending"
        : "completed";

  return {
    scheduled: jobs.length,
    downloaded,
    rows: rowsImported,
    skipped,
    status,
    reachJobConfigured: Boolean(reachJob),
    reachReportsAvailable,
    reachPending: reachSummary.pending,
    reachNeedsInvestigation: reachSummary.needsInvestigation,
  };
}
