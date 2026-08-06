import { eq, isNull, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";

// Segments de route techniques (et voisins évidents) qu'un handle ne doit jamais
// prendre, pour lever toute ambiguïté même si le handle est imbriqué sous /book.
export const RESERVED_HANDLES = new Set<string>([
  "admin",
  "api",
  "ics",
  "book",
  "auth",
  "onboarding",
  "invite",
  "r",
  "app",
  "www",
]);

const HANDLE_MIN = 3;
const HANDLE_MAX = 40;
// Format canonique : minuscules, chiffres, tirets internes uniquement.
export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}

// Validation du handle saisi à l'édition : format canonique, longueur bornée,
// hors mots réservés. L'unicité globale, elle, est garantie par l'index DB au
// moment de l'écriture (voir la server action d'édition).
export const bookingHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(HANDLE_MIN, `Le lien doit faire au moins ${HANDLE_MIN} caractères.`)
  .max(HANDLE_MAX, `Le lien ne peut pas dépasser ${HANDLE_MAX} caractères.`)
  .regex(HANDLE_PATTERN, "Utilise uniquement des minuscules, des chiffres et des tirets.")
  .refine((handle) => !isReservedHandle(handle), "Ce nom est réservé, choisis-en un autre.");

// URL-safe : sans accent, minuscules, [a-z0-9-], sans tiret en bord, borné à 40.
export function slugifyHandle(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, "");
}

// Un candidat n'est retenu que s'il est bien formé, assez long et non réservé.
function candidateFromRaw(raw: string): string | null {
  const slug = slugifyHandle(raw);
  if (slug.length < HANDLE_MIN || !HANDLE_PATTERN.test(slug) || isReservedHandle(slug)) return null;
  return slug;
}

// Décline un candidat de base en variantes numérotées (base, base-2, base-3, …)
// en respectant la borne de 40 caractères.
function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return `${base.slice(0, HANDLE_MAX - suffix.length)}${suffix}`;
}

function randomHandle(): string {
  return `client-${Math.random().toString(36).slice(2, 8)}`;
}

// Tente d'écrire le handle sur un compte qui n'en a pas encore. Retourne le
// handle si l'écriture a pris, null sur collision d'unicité (à réessayer avec
// une autre variante). L'écriture conditionnelle `booking_handle IS NULL` évite
// d'écraser un handle posé par un appel concurrent.
async function claimHandle(userId: string, candidate: string): Promise<string | null> {
  try {
    const [updated] = await db
      .update(users)
      .set({ bookingHandle: candidate })
      .where(and(eq(users.id, userId), isNull(users.bookingHandle)))
      .returning({ bookingHandle: users.bookingHandle });
    return updated?.bookingHandle ?? null;
  } catch (error) {
    // 23505 = unique_violation : le handle est pris par un autre compte.
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      return null;
    }
    throw error;
  }
}

// Garantit qu'un compte possède un handle et le retourne. Idempotent : si le
// compte en a déjà un, il est renvoyé tel quel (aucune régénération). Utilisé à
// la fois pour la génération paresseuse (création du 1er event) et par tout
// point qui a besoin du handle (liens e-mail, pages agenda), et pour le backfill.
export async function ensureAccountBookingHandle(userId: string): Promise<string> {
  const [row] = await db
    .select({ bookingHandle: users.bookingHandle, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new Error(`ensureAccountBookingHandle: user introuvable (${userId})`);
  if (row.bookingHandle) return row.bookingHandle;

  const profile = await getBusinessProfile(userId);
  const emailLocalPart = row.email.split("@")[0] ?? "";
  const base =
    candidateFromRaw(profile.identity.businessName) ??
    candidateFromRaw(emailLocalPart) ??
    randomHandle();

  // On tente base, base-2, … puis on bascule sur des handles aléatoires si la
  // famille est saturée ou réservée à chaque variante.
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt <= 25 ? withSuffix(base, attempt) : randomHandle();
    if (isReservedHandle(candidate) || !HANDLE_PATTERN.test(candidate)) continue;
    const claimed = await claimHandle(userId, candidate);
    if (claimed) return claimed;

    // L'update n'a rien renvoyé : soit collision d'unicité (on réessaie), soit un
    // appel concurrent a déjà posé un handle sur ce compte — dans ce cas on le lit.
    const [fresh] = await db
      .select({ bookingHandle: users.bookingHandle })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (fresh?.bookingHandle) return fresh.bookingHandle;
  }
  throw new Error(`ensureAccountBookingHandle: impossible de générer un handle unique (${userId})`);
}

// Handle courant d'un compte (peut être null si aucun event de booking n'existe
// encore et qu'aucune génération n'a eu lieu). Pour un handle garanti, préférer
// ensureAccountBookingHandle.
export async function getAccountBookingHandle(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ bookingHandle: users.bookingHandle })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.bookingHandle ?? null;
}
