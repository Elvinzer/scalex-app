import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, users } from "@/db/schema";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";

// One-off : attribue un handle de compte à chaque propriétaire ayant déjà des
// events de booking mais pas encore de handle (pré-existant à la colonne
// booking_handle). Idempotent — ensureAccountBookingHandle ne régénère jamais un
// handle déjà posé, donc rejouer le script est sans effet.
async function main() {
  const accounts = await db
    .selectDistinct({ userId: nativeBookingEvents.userId })
    .from(nativeBookingEvents)
    .innerJoin(users, eq(users.id, nativeBookingEvents.userId))
    .where(isNull(users.bookingHandle));
  console.log(`comptes à backfiller : ${accounts.length}`);

  for (const account of accounts) {
    const handle = await ensureAccountBookingHandle(account.userId);
    console.log(`  ${account.userId} → ${handle}`);
  }

  console.log("backfill terminé");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
