import { headers } from "next/headers";
import { BUSINESS_HEADER, businessIdSchema } from "@/lib/businesses/routing";

export async function getSelectedBusinessId(): Promise<string | null> {
  const value = (await headers()).get(BUSINESS_HEADER);
  const parsed = businessIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
