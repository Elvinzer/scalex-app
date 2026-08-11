"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  nativeBookingCalendarConflicts,
  nativeBookingCalendarSettings,
  nativeCalendarConnections,
} from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import { listCalendarsForConnection } from "@/lib/native-booking/calendar";
import { requirePermission } from "@/lib/team/context";

const calendarSettingsSchema = z.object({
  invitationConnectionId: z.string().uuid(),
  invitationCalendarId: z.string().trim().min(1).max(500),
  conflicts: z
    .array(
      z.object({
        connectionId: z.string().uuid(),
        calendarId: z.string().trim().min(1).max(500),
      })
    )
    .min(1)
    .max(100),
});

type SettingsActionResult = { error: string | null };

export async function saveNativeBookingCalendarSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access) return { error: "calendar_settings_forbidden" };

  const parsed = calendarSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "calendar_settings_invalid" };

  const conflictKeys = new Set(parsed.data.conflicts.map(({ connectionId, calendarId }) => `${connectionId}:${calendarId}`));
  if (conflictKeys.size !== parsed.data.conflicts.length) return { error: "calendar_settings_invalid" };

  const connectionIds = Array.from(new Set([
    parsed.data.invitationConnectionId,
    ...parsed.data.conflicts.map(({ connectionId }) => connectionId),
  ]));
  const connections = await db
    .select()
    .from(nativeCalendarConnections)
    .where(
      and(
        eq(nativeCalendarConnections.userId, access.accountId),
        eq(nativeCalendarConnections.closerUserId, userId),
        inArray(nativeCalendarConnections.id, connectionIds)
      )
    );
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const invitationConnection = connectionById.get(parsed.data.invitationConnectionId);
  if (!invitationConnection || invitationConnection.provider !== "google" || invitationConnection.status !== "connected") {
    return { error: "calendar_target_unavailable" };
  }

  const optionsByConnection = new Map<string, Awaited<ReturnType<typeof listCalendarsForConnection>>>();
  for (const connection of connections) {
    if (connection.status !== "connected") continue;
    try {
      optionsByConnection.set(connection.id, await listCalendarsForConnection(connection));
    } catch {
      return { error: "calendar_connection_unavailable" };
    }
  }

  const invitationCalendar = optionsByConnection.get(invitationConnection.id)?.find((calendar) => calendar.id === parsed.data.invitationCalendarId);
  if (!invitationCalendar?.canWrite) return { error: "calendar_target_not_writable" };

  for (const conflict of parsed.data.conflicts) {
    const connection = connectionById.get(conflict.connectionId);
    const calendar = optionsByConnection.get(conflict.connectionId)?.find((option) => option.id === conflict.calendarId);
    if (!connection || connection.provider !== "google" || connection.status !== "connected" || !calendar) {
      return { error: "calendar_conflict_invalid" };
    }
  }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: nativeBookingCalendarSettings.id })
        .from(nativeBookingCalendarSettings)
        .where(and(eq(nativeBookingCalendarSettings.userId, access.accountId), eq(nativeBookingCalendarSettings.closerUserId, userId)))
        .limit(1);
      const values = {
        userId: access.accountId,
        closerUserId: userId,
        invitationConnectionId: invitationConnection.id,
        invitationCalendarId: parsed.data.invitationCalendarId,
        updatedAt: new Date(),
      };
      if (existing) {
        await tx.update(nativeBookingCalendarSettings).set(values).where(eq(nativeBookingCalendarSettings.id, existing.id));
      } else {
        await tx.insert(nativeBookingCalendarSettings).values(values);
      }

      await tx
        .delete(nativeBookingCalendarConflicts)
        .where(and(eq(nativeBookingCalendarConflicts.userId, access.accountId), eq(nativeBookingCalendarConflicts.closerUserId, userId)));
      await tx.insert(nativeBookingCalendarConflicts).values(
        parsed.data.conflicts.map(({ connectionId, calendarId }) => ({
          userId: access.accountId,
          closerUserId: userId,
          connectionId,
          calendarId,
        }))
      );
    });
  } catch {
    return { error: "calendar_settings_save_failed" };
  }

  revalidatePath("/settings/calendars");
  revalidatePath("/ventes/rdv");
  return { error: null };
}

export async function disconnectNativeBookingCalendarAction(input: unknown): Promise<SettingsActionResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access) return { error: "calendar_settings_forbidden" };

  const parsed = z.object({ connectionId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "calendar_connection_not_found" };

  const [connection] = await db
    .select({ id: nativeCalendarConnections.id })
    .from(nativeCalendarConnections)
    .where(
      and(
        eq(nativeCalendarConnections.id, parsed.data.connectionId),
        eq(nativeCalendarConnections.userId, access.accountId),
        eq(nativeCalendarConnections.closerUserId, userId)
      )
    )
    .limit(1);
  if (!connection) return { error: "calendar_connection_not_found" };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(nativeCalendarConnections)
        .set({ status: "revoked", accessTokenEncrypted: null, refreshTokenEncrypted: null, tokenExpiresAt: null, updatedAt: new Date() })
        .where(eq(nativeCalendarConnections.id, connection.id));
      await tx
        .update(nativeBookingCalendarSettings)
        .set({ invitationConnectionId: null, invitationCalendarId: null, updatedAt: new Date() })
        .where(
          and(
            eq(nativeBookingCalendarSettings.userId, access.accountId),
            eq(nativeBookingCalendarSettings.closerUserId, userId),
            eq(nativeBookingCalendarSettings.invitationConnectionId, connection.id)
          )
        );
      await tx.delete(nativeBookingCalendarConflicts).where(eq(nativeBookingCalendarConflicts.connectionId, connection.id));
    });
  } catch {
    return { error: "calendar_disconnect_failed" };
  }

  revalidatePath("/settings/calendars");
  revalidatePath("/ventes/rdv");
  return { error: null };
}
