import { TESTIMONIALS } from "./content";

// Placeholder quotes/names — clearly swappable content, see content.ts.
export function Testimonials() {
  return (
    <section id="avis" className="mx-auto max-w-[1360px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24">
      <h2 className="mb-14 text-center text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">
        Ils nous ont fait confiance
      </h2>

      <div className="grid gap-5 sm:grid-cols-3">
        {TESTIMONIALS.map((testimonial) => (
          <div key={testimonial.name} className="rounded-[20px] border border-border bg-white p-7">
            <p className="mb-6 text-[15px] leading-relaxed text-foreground">&ldquo;{testimonial.quote}&rdquo;</p>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-text">
                {testimonial.name.charAt(0)}
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-foreground">{testimonial.name}</p>
                <p className="text-[12.5px] text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
