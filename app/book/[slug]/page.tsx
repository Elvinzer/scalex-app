import { CalendarX2 } from "lucide-react";

import { getPublicNativeBookingEvent } from "@/lib/native-booking/queries";

import { PublicBookingPage } from "./public-booking-page";

export default async function PublicBookingRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicNativeBookingEvent(slug);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="sticker-card flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <CalendarX2 className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Cette page n&apos;est pas disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">Le lien est peut-être en pause ou n&apos;est plus actif.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PublicBookingPage
      event={{
        slug: event.slug,
        name: event.name,
        description: event.description,
        durationMinutes: event.durationMinutes,
        timeZone: event.timeZone,
        meetingLabel: event.meetingLabel,
        publicHeading: event.publicHeading,
        publicDescription: event.publicDescription,
        confirmationTitle: event.confirmationTitle,
        confirmationMessage: event.confirmationMessage,
        bookingInstructions: event.bookingInstructions,
      }}
    />
  );
}
