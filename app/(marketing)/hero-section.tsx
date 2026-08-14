import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { DashboardMockup } from "./dashboard-mockup";

export function HeroSection() {
  const t = useTranslations("marketing");

  return (
    <section className="px-6 pt-14 pb-20 sm:px-10 sm:pt-20 sm:pb-28">
      <div className="mx-auto grid max-w-[1360px] items-center gap-14 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent-text">
            {t("hero.eyebrow")}
          </span>

          <h1 className="text-[clamp(2.3rem,4.6vw,3.4rem)] leading-[1.08] font-bold tracking-tight text-foreground">
            {t("hero.title")}
            <br />
            <span className="text-accent">{t("hero.accent")}</span>
          </h1>

          <p className="max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            {t("hero.description")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
              <Link href="/diagnostic">{t("hero.primaryCta")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
              <Link href="/sign-in?intent=trial&plan=solo">{t("hero.secondaryCta")}</Link>
            </Button>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">{t("hero.secondaryNote")}</p>

          <div className="flex items-center gap-3 pt-2">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            <p className="text-[12.5px] font-semibold text-muted-foreground">{t("hero.proof")}</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[580px] pt-6 pb-10 lg:pt-0">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-6 left-1/2 size-56 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
          />
          <DashboardMockup ariaLabel={t("hero.mockupAlt")} />
          <Falco
            variant="dashboard"
            size="xl"
            animate="enter"
            priority
            className="pointer-events-none absolute -bottom-10 -left-6 w-[110px] drop-shadow-[0_16px_28px_rgba(0,0,0,0.18)] sm:-left-20 sm:w-[150px] lg:-left-36 lg:w-[180px]"
          />
        </div>
      </div>
    </section>
  );
}
