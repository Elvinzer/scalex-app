import { BENEFITS } from "./content";
import { useTranslations } from "next-intl";

export function BenefitCards() {
  const t = useTranslations("marketing");

  return (
    <section id="fonctionnalites" className="mx-auto max-w-[1360px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">{t("benefits.heading")}</h2>
        <p className="mt-3 text-[15.5px] text-muted-foreground">{t("benefits.intro")}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.key}
              className="rounded-[20px] border border-border bg-white p-7 shadow-[var(--shadow-xs)] transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
            >
              <div className="mb-5 flex size-11 items-center justify-center rounded-[14px] bg-accent-soft">
                <Icon className="size-5 text-accent" />
              </div>
              <p className="mb-2 text-[17px] font-bold text-foreground">{t("benefits." + benefit.key + ".title")}</p>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                {t("benefits." + benefit.key + ".description")}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
