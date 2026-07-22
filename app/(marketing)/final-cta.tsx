import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="px-6 py-16 sm:px-10 sm:py-20">
      <div className="relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] bg-accent-soft px-8 py-14 sm:px-14 sm:py-16">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, transparent 0px, transparent 38px, var(--accent-border) 38px, var(--accent-border) 40px)",
          }}
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_auto]">
          <div>
            <h2 className="mb-4 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-tight font-bold text-foreground">
              Récupère ce que ton business perd.
            </h2>
            <p className="mb-7 max-w-lg text-[16px] leading-relaxed text-foreground/70">
              Découvre tes principales fuites et les actions qui auront le plus d&apos;impact.
            </p>
            <Button asChild size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
              <a href="/sign-in">Se connecter →</a>
            </Button>
          </div>

          <Falco variant="insights" size="xl" className="relative mx-auto w-[170px] sm:w-[210px]" />
        </div>
      </div>
    </section>
  );
}
