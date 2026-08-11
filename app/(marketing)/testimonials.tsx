import { useTranslations } from "next-intl";

import { USE_CASES } from "./content";

export function UseCases() {
  const t = useTranslations("marketing");

  return (
    <section id="cas-usage" className="mx-auto max-w-[1360px] scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24">
      <h2 className="mb-14 text-center text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">
        {t("useCases.heading")}
      </h2>
      <p className="mx-auto mb-10 max-w-2xl text-center text-[15.5px] text-muted-foreground">
        {t("useCases.intro")}
      </p>

      <div className="grid gap-5 sm:grid-cols-3">
        {USE_CASES.map((useCase) => (
          <div key={useCase.key} className="rounded-[20px] border border-border bg-white p-7">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-accent">
              {t("useCases." + useCase.key + ".label")}
            </p>
            <p className="mb-3 text-[17px] font-bold text-foreground">
              {t("useCases." + useCase.key + ".title")}
            </p>
            <p className="text-[14.5px] leading-relaxed text-muted-foreground">
              {t("useCases." + useCase.key + ".description")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
