import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/current-user";
import {
  createBookingAssetSignedUrl,
  deleteBookingAsset,
  isOwnedBookingAssetPath,
  uploadBookingAsset,
} from "@/lib/booking-page/storage";
import { requirePermission } from "@/lib/team/context";

const kindSchema = z.enum(["photo", "video"]);
const deleteSchema = z.object({ path: z.string().trim().min(1).max(512) });

function errorResponse(message: string, status = 422) {
  return NextResponse.json({ error: message }, { status });
}

async function getAccess() {
  try {
    const { userId } = await getCurrentUser();
    const access = await requirePermission(userId, "delivrabilite:temoignages");
    return access ? { ...access, userId } : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const access = await getAccess();
  if (!access) return errorResponse("Session expirée ou accès insuffisant.", 401);
  const formData = await request.formData();
  const kind = kindSchema.safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success || !(file instanceof File)) return errorResponse("Fichier invalide.");

  const accepted = kind.data === "photo"
    ? ["image/jpeg", "image/png", "image/webp"]
    : ["video/mp4"];
  const maxBytes = kind.data === "photo" ? 10 * 1024 * 1024 : 200 * 1024 * 1024;
  if (!accepted.includes(file.type)) return errorResponse("Ce format de fichier n'est pas accepté.");
  if (file.size === 0 || file.size > maxBytes) return errorResponse("Ce fichier dépasse la taille autorisée.");

  const source = Buffer.from(await file.arrayBuffer());
  let body = source;
  let contentType = file.type;
  let extension = "mp4";
  if (kind.data === "photo") {
    try {
      body = await sharp(source, { failOn: "error" })
        .rotate()
        .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      contentType = "image/webp";
      extension = "webp";
    } catch {
      return errorResponse("Impossible de traiter cette image.");
    }
  }

  const path = `${access.accountId}/testimonials/${randomUUID()}.${extension}`;
  const uploaded = await uploadBookingAsset(path, body, contentType);
  if (uploaded.error) return errorResponse("Le fichier n'a pas pu être stocké. Réessaie.", 500);
  const url = await createBookingAssetSignedUrl(path, access.accountId);
  return NextResponse.json({ path, url });
}

export async function DELETE(request: Request) {
  const access = await getAccess();
  if (!access) return errorResponse("Session expirée ou accès insuffisant.", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isOwnedBookingAssetPath(parsed.data.path, access.accountId) || !parsed.data.path.includes("/testimonials/")) {
    return errorResponse("Fichier invalide.");
  }
  await deleteBookingAsset(parsed.data.path, access.accountId);
  return NextResponse.json({ ok: true });
}
