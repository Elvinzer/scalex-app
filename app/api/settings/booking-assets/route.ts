import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/current-user";
import { bookingAssetKindSchema } from "@/lib/booking-page/schema";
import {
  createBookingAssetSignedUrl,
  deleteBookingAsset,
  isOwnedBookingAssetPath,
  uploadBookingAsset,
} from "@/lib/booking-page/storage";
import { requireOwner } from "@/lib/team/context";

const MAX_BYTES: Record<z.infer<typeof bookingAssetKindSchema>, number> = {
  background: 5 * 1024 * 1024,
  logo: 1 * 1024 * 1024,
  "side-image": 5 * 1024 * 1024,
  "side-video": 25 * 1024 * 1024,
};

const ALLOWED_TYPES: Record<z.infer<typeof bookingAssetKindSchema>, readonly string[]> = {
  background: ["image/jpeg", "image/png", "image/webp"],
  logo: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  "side-image": ["image/jpeg", "image/png", "image/webp"],
  "side-video": ["video/mp4"],
};

const deleteInputSchema = z.object({ path: z.string().trim().min(1).max(512) });

function jsonError(error: string, status = 422) {
  return NextResponse.json({ error }, { status });
}

async function getOwnerAccount() {
  try {
    const { userId } = await getCurrentUser();
    return await requireOwner(userId);
  } catch {
    return null;
  }
}

function safeSvg(buffer: Buffer): boolean {
  const source = buffer.toString("utf8");
  return /<svg[\s>]/i.test(source) && !/<script|javascript:|on[a-z]+\s*=|<foreignObject/i.test(source);
}

export async function POST(request: Request) {
  const access = await getOwnerAccount();
  if (!access) return jsonError("Session expirée ou accès insuffisant.", 401);

  const formData = await request.formData();
  const kind = bookingAssetKindSchema.safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success || !(file instanceof File)) return jsonError("Fichier invalide.");

  if (!ALLOWED_TYPES[kind.data].includes(file.type)) return jsonError("Ce format de fichier n’est pas accepté.");
  if (file.size === 0 || file.size > MAX_BYTES[kind.data]) return jsonError("Ce fichier dépasse la taille autorisée.");

  const source = Buffer.from(await file.arrayBuffer());
  let body: Buffer = source;
  let contentType = file.type;
  let extension = "mp4";

  try {
    if (kind.data === "side-video") {
      extension = "mp4";
    } else if (kind.data === "logo" && file.type === "image/svg+xml") {
      if (!safeSvg(source)) return jsonError("Ce SVG contient un élément non sécurisé.");
      extension = "svg";
    } else {
      const image = sharp(source, { failOn: "error" });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) return jsonError("Les dimensions de cette image sont introuvables.");
      if (kind.data === "background" && (metadata.width < 1920 || metadata.height < 1080)) {
        return jsonError("L’image de fond doit mesurer au moins 1920 × 1080 px.");
      }

      const processed = image.rotate();
      if (kind.data === "background") {
        body = await processed.resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      } else if (kind.data === "side-image") {
        body = await processed.resize({ width: 900, height: 1200, fit: "cover", position: "attention" }).webp({ quality: 82 }).toBuffer();
      } else {
        body = await processed.resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      }
      contentType = "image/webp";
      extension = "webp";
    }
  } catch {
    return jsonError("Impossible de traiter ce fichier image.");
  }

  const path = `${access.accountId}/${kind.data}-${randomUUID()}.${extension}`;
  const { error } = await uploadBookingAsset(path, body, contentType);
  if (error) return jsonError("Le fichier n’a pas pu être stocké. Réessaie.", 500);

  const data = await createBookingAssetSignedUrl(path, access.accountId);
  return NextResponse.json({ path, url: data });
}

export async function DELETE(request: Request) {
  const access = await getOwnerAccount();
  if (!access) return jsonError("Session expirée ou accès insuffisant.", 401);
  const parsed = deleteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isOwnedBookingAssetPath(parsed.data.path, access.accountId)) return jsonError("Asset invalide.");
  await deleteBookingAsset(parsed.data.path, access.accountId);
  return NextResponse.json({ ok: true });
}
