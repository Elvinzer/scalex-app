import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getSalesSummaryByMonth } from "@/lib/sales/queries";
import { formatPercent, rate } from "@/lib/setting/funnel";
import { getTestimonials } from "@/lib/testimonials/queries";

import { TestimonialFormDialog } from "./testimonial-form-dialog";
import { TestimonialsList } from "./testimonials-list";

function currentMonth(): { year: number; month: number; prefix: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return { year, month, prefix: `${year}-${String(month).padStart(2, "0")}` };
}

export default async function TemoignagesPage() {
  const { userId } = await getCurrentUser();
  const { year, month, prefix } = currentMonth();
  const [testimonials, salesByMonth] = await Promise.all([
    getTestimonials(userId),
    getSalesSummaryByMonth(userId, year),
  ]);

  const testimonialsThisMonth = testimonials.filter((t) => t.collectedAt.startsWith(prefix));
  const salesClosedThisMonth = salesByMonth[month]?.closedCount ?? 0;
  const collectionRate = rate(testimonialsThisMonth.length, salesClosedThisMonth);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">Témoignages</h1>
          <p className="mt-1 text-muted-foreground">
            Chaque témoignage client collecté — texte, vidéo, capture ou audio.
          </p>
        </div>
        <TestimonialFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              Ajouter un témoignage
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Total témoignages</p>
          <p className="mt-2 font-display text-3xl font-medium">{testimonials.length}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Ce mois-ci</p>
          <p className="mt-2 font-display text-3xl font-medium">{testimonialsThisMonth.length}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Taux de collecte</p>
          <p className="mt-2 font-display text-3xl font-medium">
            {collectionRate === null ? "—" : formatPercent(collectionRate)}
          </p>
        </div>
      </div>

      <TestimonialsList testimonials={testimonials} />
    </div>
  );
}
