import { Star } from "lucide-react";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";

import { DashboardMockup } from "./dashboard-mockup";

const AVATAR_INITIALS = ["A", "S", "M"];

export function HeroSection() {
  return (
    <section className="px-6 pt-14 pb-20 sm:px-10 sm:pt-20 sm:pb-28">
      <div className="mx-auto grid max-w-[1360px] items-center gap-14 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent-text">
            Augmenter de 20 % ton acquisition, c&apos;est faire x3 sur ton CA.
          </span>

          <h1 className="text-[clamp(2.3rem,4.6vw,3.4rem)] leading-[1.08] font-bold tracking-tight text-foreground">
            Ton business perd de l&apos;argent chaque mois.
            <br />
            On te dit <span className="text-accent">où</span>.
            <br />
            On t&apos;aide à le <span className="text-accent">corriger</span>.
          </h1>

          <p className="max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            Scale X analyse ton acquisition, ta conversion, ton closing, ta rétention et tes
            opérations pour identifier précisément les fuites qui ralentissent ta croissance.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
              <a href="/sign-in">Se connecter</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
              <a href="#produit">Voir la plateforme</a>
            </Button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="flex -space-x-2.5">
              {AVATAR_INITIALS.map((initial) => (
                <div
                  key={initial}
                  className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-accent-soft text-[12px] font-bold text-accent-text"
                >
                  {initial}
                </div>
              ))}
            </div>
            <div>
              <div className="flex gap-0.5 text-accent" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </div>
              <p className="text-[12.5px] font-semibold text-muted-foreground">
                Déjà adopté par plus de 2 500 entrepreneurs ambitieux
              </p>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[580px] pt-6 pb-10 lg:pt-0">
          <div
            aria-hidden
            className="absolute -bottom-6 left-1/2 size-56 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
          />
          <DashboardMockup />
          <Falco
            variant="dashboard"
            size="xl"
            animate="enter"
            priority
            className="absolute -bottom-10 -left-28 w-[150px] drop-shadow-[0_16px_28px_rgba(0,0,0,0.18)] sm:-left-36 sm:w-[180px]"
          />
        </div>
      </div>
    </section>
  );
}
