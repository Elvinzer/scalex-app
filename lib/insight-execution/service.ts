import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  improvementEvents,
  improvementInitiatives,
  insightRecords,
} from "@/db/schema";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function recordEventOnce(
  accountId: string,
  type: "initiative_launched" | "initiative_completed" | "initiative_measured",
  initiativeId: string,
  label: string,
): Promise<void> {
  await db
    .insert(improvementEvents)
    .values({
      userId: accountId,
      date: today(),
      type,
      label,
      sourceId: initiativeId,
    })
    .onConflictDoNothing();
}

export async function markInitiativeCompleted(
  accountId: string,
  initiativeId: string,
  label: string,
): Promise<void> {
  const [initiative] = await db
    .select({
      id: improvementInitiatives.id,
      status: improvementInitiatives.status,
      insightRecordId: improvementInitiatives.insightRecordId,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.id, initiativeId),
        eq(improvementInitiatives.userId, accountId),
      ),
    )
    .limit(1);
  if (
    !initiative ||
    initiative.status === "measured" ||
    initiative.status === "cancelled"
  )
    return;

  const completedAt = new Date();
  await db
    .update(improvementInitiatives)
    .set({
      status: "completed",
      completedAt,
      lastActivityAt: completedAt,
      updatedAt: completedAt,
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiativeId),
        eq(improvementInitiatives.userId, accountId),
      ),
    );
  await db
    .update(insightRecords)
    .set({ decision: "completed", updatedAt: completedAt })
    .where(
      and(
        eq(insightRecords.id, initiative.insightRecordId),
        eq(insightRecords.userId, accountId),
      ),
    );
  await recordEventOnce(
    accountId,
    "initiative_completed",
    initiativeId,
    `Action terminée : ${label}`,
  );
}

export async function syncInitiativesForTodo(
  accountId: string,
  todoId: string,
  done: boolean,
  label: string,
): Promise<void> {
  const initiatives = await db
    .select({
      id: improvementInitiatives.id,
      status: improvementInitiatives.status,
      insightRecordId: improvementInitiatives.insightRecordId,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, accountId),
        eq(improvementInitiatives.todoId, todoId),
      ),
    );
  for (const initiative of initiatives) {
    if (done) {
      await markInitiativeCompleted(accountId, initiative.id, label);
    } else if (
      initiative.status === "completed" ||
      initiative.status === "awaiting_measurement"
    ) {
      const now = new Date();
      await db
        .update(improvementInitiatives)
        .set({
          status: "in_progress",
          completedAt: null,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(improvementInitiatives.id, initiative.id),
            eq(improvementInitiatives.userId, accountId),
          ),
        );
      await db
        .update(insightRecords)
        .set({ decision: "launched", updatedAt: now })
        .where(
          and(
            eq(insightRecords.id, initiative.insightRecordId),
            eq(insightRecords.userId, accountId),
          ),
        );
    }
  }
}

export async function syncInitiativesForProject(
  accountId: string,
  projectId: string,
  done: boolean,
  label: string,
): Promise<void> {
  const initiatives = await db
    .select({
      id: improvementInitiatives.id,
      status: improvementInitiatives.status,
      insightRecordId: improvementInitiatives.insightRecordId,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, accountId),
        eq(improvementInitiatives.projectId, projectId),
      ),
    );
  for (const initiative of initiatives) {
    if (done) {
      await markInitiativeCompleted(accountId, initiative.id, label);
    } else if (
      initiative.status === "completed" ||
      initiative.status === "awaiting_measurement"
    ) {
      const now = new Date();
      await db
        .update(improvementInitiatives)
        .set({
          status: "in_progress",
          completedAt: null,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(improvementInitiatives.id, initiative.id),
            eq(improvementInitiatives.userId, accountId),
          ),
        );
      await db
        .update(insightRecords)
        .set({ decision: "launched", updatedAt: now })
        .where(
          and(
            eq(insightRecords.id, initiative.insightRecordId),
            eq(insightRecords.userId, accountId),
          ),
        );
    }
  }
}

export async function recordInitiativeLaunched(
  accountId: string,
  initiativeId: string,
  label: string,
): Promise<void> {
  await recordEventOnce(
    accountId,
    "initiative_launched",
    initiativeId,
    `Action lancée : ${label}`,
  );
}

export async function recordInitiativeMeasured(
  accountId: string,
  initiativeId: string,
  label: string,
): Promise<void> {
  await recordEventOnce(
    accountId,
    "initiative_measured",
    initiativeId,
    `Résultat mesuré : ${label}`,
  );
}
