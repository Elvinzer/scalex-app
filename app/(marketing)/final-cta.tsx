import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function FinalCta() {
  const t = useTranslations("marketing");

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
              {t("finalCta.heading")}
            </h2>
            <p className="mb-7 max-w-lg text-[16px] leading-relaxed text-foreground/70">
              {t("finalCta.description")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-[12px] px-7 py-6 text-[15px]">
                <Link href="/diagnostic">{t("finalCta.primaryCta")}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-[12px] border-foreground/20 bg-white/70 px-7 py-6 text-[15px]">
                <Link href="/sign-in?intent=trial&plan=solo">{t("finalCta.secondaryCta")}</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-foreground/60">{t("finalCta.secondaryNote")}</p>
          </div>

          <Falco variant="insights" size="xl" className="relative mx-auto w-[170px] sm:w-[210px]" />
        </div>
      </div>
    </section>
  );
}
