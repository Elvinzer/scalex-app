import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getResendClient, isResendConfigured } from "@/lib/resend-client";
import { getTranslations } from "next-intl/server";

export const trialReminderPayloadSchema = z.object({
  userId: z.string().min(1),
  subscriptionId: z.string().min(1),
  trialEnd: z.number().int().positive(),
});

export type TrialReminderPayload = z.infer<typeof trialReminderPayloadSchema>;

export async function sendTrialReminderEmail(payload: Pick<TrialReminderPayload, "userId" | "trialEnd">): Promise<boolean> {
  if (!isResendConfigured()) return false;

  const [user] = await db
    .select({ email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user?.email) return false;

  const locale = user.locale === "en" ? "en" : "fr";
  const t = await getTranslations({ locale, namespace: "freeDiagnostic" });
  const trialEnd = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(payload.trialEnd * 1000));

  await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Minaly <hello@minaly.io>",
    to: [user.email],
    subject: t("result.trialReminderSubject"),
    text: t("result.trialReminderBody", { date: trialEnd }),
  });

  return true;
}
