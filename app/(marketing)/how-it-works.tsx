import { HOW_IT_WORKS_STEPS } from "./content";

export function HowItWorks() {
  return (
    <section id="comment-ca-marche" className="scroll-mt-20 bg-[var(--surface-sunken)] px-6 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-[1360px]">
        <h2 className="mb-14 text-center text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">
          Comment ça marche ?
        </h2>

        <div className="relative grid gap-10 sm:grid-cols-3 sm:gap-6">
          <div aria-hidden className="absolute top-6 right-0 left-0 hidden h-px bg-border sm:block" />
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div key={step.n} className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="relative z-10 mb-5 flex size-12 items-center justify-center rounded-full border border-border bg-white font-display text-[15px] font-bold text-accent">
                {step.n}
              </div>
              <p className="mb-2 text-[17px] font-bold text-foreground">{step.title}</p>
              <p className="max-w-[240px] text-[14.5px] leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
