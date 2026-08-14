"use server";

import { createAdminIdea as createIdea, moveAdminIdea as moveIdea } from "@/lib/admin/ideas";

export async function createAdminIdea(input: unknown) {
  return createIdea(input);
}

export async function moveAdminIdea(input: unknown) {
  return moveIdea(input);
}
