import { BENEFITS } from "./content";

export function BenefitCards() {
  return (
    <section id="fonctionnalites" className="mx-auto max-w-[1360px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-20">
      <div className="grid gap-5 sm:grid-cols-3">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.title}
              className="rounded-[20px] border border-border bg-white p-7 shadow-[var(--shadow-xs)] transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
            >
              <div className="mb-5 flex size-11 items-center justify-center rounded-[14px] bg-accent-soft">
                <Icon className="size-5 text-accent" />
              </div>
              <p className="mb-2 text-[17px] font-bold text-foreground">{benefit.title}</p>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
