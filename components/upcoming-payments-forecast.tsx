import { getTranslations } from "next-intl/server";

import type { UpcomingPaymentForecast } from "@/lib/sales/forecast";

export async function UpcomingPaymentsForecast({
  items,
  locale,
}: {
  items: UpcomingPaymentForecast[];
  locale: string;
}) {
  const t = await getTranslations("sales");

  return (
    <section className="flex flex-col gap-3" aria-labelledby="upcoming-payments-forecast-title">
      <div>
        <h3 id="upcoming-payments-forecast-title" className="text-lg font-bold">{t("forecastTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("forecastHelp")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => {
          const [year, month] = item.monthKey.split("-").map(Number);
          const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
          return (
            <article key={item.monthKey} className="sticker-card min-w-0 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("forecastMonth", { offset: item.offset })}</p>
              <h4 className="mt-1 truncate text-sm font-bold capitalize" title={label}>{label}</h4>
              <p className="mt-3 text-xl font-bold tabular-nums">{new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(item.amount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("forecastCount", { count: item.count })}</p>
            </article>
          );
        })}
      </div>
      {items.every((item) => item.amount === 0) ? <p className="text-sm text-muted-foreground">{t("forecastEmpty")}</p> : null}
    </section>
  );
}
