import { and, eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { streaks, users } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { getResendClient } from "@/lib/resend-client";
import { refreshStreak } from "@/lib/streak/service";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { getAppUrl } from "@/lib/utils";

// 19:00 UTC — late enough to be an end-of-day nudge, and the single pass that
// keeps every account's streak honest whether or not they opened the app.
//
// The refresh itself is the important half: a streak decays silently (nobody
// "does" the breaking), so without a daily pass an account that stopped in
// March would still be showing a live flame from its last page view. The
// refresh is idempotent, so re-running this job is free.
//
// The email half only ever reaches users who switched it on themselves
// (streaks.reminder_opt_in, false by default — §C). Its copy is deliberately
// flat: it states what would validate the day and stops. No countdown, no
// "tu vas perdre ta série", no mention of the streak's length at all, since
// the length is exactly what would turn a reminder into a threat.
export const refreshStreaks = inngest.createFunction(
  { id: "refresh-streaks", triggers: [cron("0 19 * * *")] },
  async ({ step }) => {
    const accounts = await step.run("load-accounts", async () => {
      return db
        .select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users)
        .where(and(eq(users.onboardingCompleted, true), eq(users.isTestAccount, false)));
    });

    const appUrl = getAppUrl();

    const results = await Promise.all(
      accounts.map((account) =>
        step.run(`streak-${account.id}`, async () => {
          const snapshot = await refreshStreak(account.id);

          // Opt-in, and only when there is genuinely nothing logged today.
          if (!snapshot.reminderOptIn || snapshot.todayValidated) {
            return { userId: account.id, current: snapshot.current, reminded: false };
          }

          const [row] = await db.select({ userId: streaks.userId }).from(streaks).where(eq(streaks.userId, account.id)).limit(1);
          if (!row || !account.email) return { userId: account.id, current: snapshot.current, reminded: false };

          const firstName = account.displayName?.split(" ")[0] ?? "toi";
          const unsubscribeUrl = `${appUrl}/api/unsubscribe?u=${account.id}&token=${signUnsubscribeToken(account.id)}`;

          const resend = getResendClient();
          await resend.emails.send({
            from: "Minaly <brief@minaly.io>",
            to: account.email,
            subject: "Un petit quelque chose aujourd'hui ?",
            text: [
              `Salut ${firstName},`,
              "",
              "Rien n'est encore enregistré aujourd'hui. Une seule action suffit :",
              "publier un contenu, envoyer une campagne, cocher une action du Journal,",
              "remplir tes chiffres ou travailler un lead.",
              "",
              `Ouvrir Minaly : ${appUrl}/roadmap`,
              "",
              `Ne plus recevoir ce rappel : ${unsubscribeUrl}`,
            ].join("\n"),
          });

          return { userId: account.id, current: snapshot.current, reminded: true };
        })
      )
    );

    return {
      accounts: results.length,
      reminded: results.filter((result) => result.reminded).length,
    };
  }
);
