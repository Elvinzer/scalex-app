import { useTranslations } from "next-intl";

import { FAQ_KEYS } from "./content";

export function FaqSection() {
  const t = useTranslations("marketing");

  return (
    <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24">
      <div className="mb-10 text-center">
        <h2 className="text-[clamp(1.9rem,3.4vw,2.6rem)] font-bold text-foreground">{t("faq.heading")}</h2>
      </div>
      <div className="divide-y divide-border rounded-[20px] border border-border bg-white">
        {FAQ_KEYS.map((key) => (
          <details key={key} className="group p-6 first:rounded-t-[20px] last:rounded-b-[20px]">
            <summary className="cursor-pointer list-none pr-8 text-[16px] font-bold text-foreground marker:hidden">
              {t("faq." + key + ".question")}
            </summary>
            <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">
              {t("faq." + key + ".answer")}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
