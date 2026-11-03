"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createBusiness } from "@/lib/businesses/queries";
import { businessHref } from "@/lib/businesses/routing";
import { requireUserId } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";

const createInput = z.object({ name: z.string().trim().min(2).max(100), requestId: z.string().uuid() });

export type CreateBusinessState = { error: "invalidName" | "createFailed" | null };

export async function createBusinessAction(_previous: CreateBusinessState, form: FormData): Promise<CreateBusinessState> {
  const userId = await requireUserId();
  const parsed = createInput.safeParse({ name: form.get("name"), requestId: form.get("requestId") });
  if (!parsed.success) return { error: "invalidName" };
  let businessId: string;
  try {
    businessId = await createBusiness(userId, parsed.data.name, parsed.data.requestId);
  } catch {
    return { error: "createFailed" };
  }
  const context = await getAccountContext(userId, { businessId, allowSuspended: true });
  redirect(businessHref(businessId, context?.entitlement.active ? "/onboarding" : "/settings/facturation"));
}
