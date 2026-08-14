import type { ClientJourneyColumnType, ClientJourneyStatus } from "./types";

export type JourneyMetricInput = {
  status: ClientJourneyStatus;
  columnType: ClientJourneyColumnType;
  enteredAt: Date | string;
  lastActivityAt: Date | string;
};

export type DeliveryMetrics = {
  totalClients: number;
  activeClients: number;
  successRate: number | null;
  dropoutRate: number | null;
  averageDurationDays: number | null;
  newcomers: number;
  completedCount: number;
  successfulCount: number;
  inactiveCount: number;
  insufficientSample: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_DAYS = 14;
const MIN_COMPARISON_SAMPLE = 10;

function asTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function daysBetween(from: Date | string, to: Date | string): number {
  return Math.max(0, Math.round((asTime(to) - asTime(from)) / DAY_MS));
}

export function computeDeliveryMetrics(rows: readonly JourneyMetricInput[], now = new Date()): DeliveryMetrics {
  const totalClients = rows.length;
  const activeClients = rows.filter((row) => row.status === "active").length;
  const successfulRows = rows.filter((row) => row.columnType === "success" || row.columnType === "end");
  const completedRows = rows.filter(
    (row) => row.status !== "active" || row.columnType === "success" || row.columnType === "end",
  );
  const inactiveRows = rows.filter(
    (row) => row.status === "abandoned" || daysBetween(row.lastActivityAt, now) > INACTIVE_DAYS,
  );
  const newcomers = rows.filter(
    (row) => daysBetween(row.enteredAt, now) < INACTIVE_DAYS && row.columnType === "entry",
  ).length;
  const durations = rows
    .filter((row) => row.status === "completed" || row.columnType === "end")
    .map((row) => daysBetween(row.enteredAt, row.lastActivityAt));
  const insufficientSample = totalClients < MIN_COMPARISON_SAMPLE;

  return {
    totalClients,
    activeClients,
    successRate: insufficientSample || completedRows.length === 0 ? null : successfulRows.length / completedRows.length,
    dropoutRate: insufficientSample || totalClients === 0 ? null : inactiveRows.length / totalClients,
    averageDurationDays: insufficientSample || durations.length === 0 ? null : durations.reduce((sum, value) => sum + value, 0) / durations.length,
    newcomers,
    completedCount: completedRows.length,
    successfulCount: successfulRows.length,
    inactiveCount: inactiveRows.length,
    insufficientSample,
  };
}
