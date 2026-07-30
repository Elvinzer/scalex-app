"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { salesCallComments, salesCalls, users } from "@/db/schema";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

export type CallComment = {
  id: string;
  body: string;
  createdAt: string; // ISO
  authorName: string;
  isOwn: boolean;
};

// Confirms the call exists and belongs to the caller's account. Returns the
// resolved { userId (author), accountId } or an error shape.
async function authorizeCall(callId: string): Promise<{ userId: string; accountId: string } | { error: string }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const [call] = await db
    .select({ id: salesCalls.id })
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, access.accountId)))
    .limit(1);
  if (!call) return { error: "Appel introuvable." };

  return { userId, accountId: access.accountId };
}

export async function getCallComments(callId: string): Promise<{ error: string | null; comments: CallComment[] }> {
  const auth = await authorizeCall(callId);
  if ("error" in auth) return { error: auth.error, comments: [] };

  const rows = await db
    .select({
      id: salesCallComments.id,
      body: salesCallComments.body,
      createdAt: salesCallComments.createdAt,
      authorId: salesCallComments.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(salesCallComments)
    .innerJoin(users, eq(users.id, salesCallComments.userId))
    .where(eq(salesCallComments.callId, callId))
    .orderBy(asc(salesCallComments.createdAt));

  const comments = rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    authorName: r.displayName ?? r.email,
    isOwn: r.authorId === auth.userId,
  }));

  return { error: null, comments };
}

const bodySchema = z.string().trim().min(1, "Le commentaire est vide.").max(2000, "2000 caractères maximum.");

export async function addCallComment(callId: string, body: unknown): Promise<{ error: string | null }> {
  const auth = await authorizeCall(callId);
  if ("error" in auth) return { error: auth.error };

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Commentaire invalide" };

  await db.insert(salesCallComments).values({ callId, userId: auth.userId, body: parsed.data });

  revalidatePath("/ventes/appels");
  return { error: null };
}

export async function deleteCallComment(commentId: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  // Verify the comment's call is in this account, and read its author.
  const [row] = await db
    .select({ authorId: salesCallComments.userId })
    .from(salesCallComments)
    .innerJoin(salesCalls, eq(salesCallComments.callId, salesCalls.id))
    .where(and(eq(salesCallComments.id, commentId), eq(salesCalls.userId, access.accountId)))
    .limit(1);
  if (!row) return { error: "Commentaire introuvable." };
  if (row.authorId !== userId) return { error: "Tu ne peux supprimer que tes propres commentaires." };

  await db.delete(salesCallComments).where(eq(salesCallComments.id, commentId));

  revalidatePath("/ventes/appels");
  return { error: null };
}
