import { RESULT_METRICS } from "./content";

export function ResultsStrip() {
  return (
    <section className="mx-auto max-w-[1360px] px-6 sm:px-10">
      <div className="grid gap-8 rounded-[22px] border border-border bg-white px-8 py-10 sm:grid-cols-3 sm:gap-0 sm:py-12">
        {RESULT_METRICS.map((metric, index) => (
          <div
            key={metric.label}
            className={
              index > 0
                ? "flex flex-col items-center gap-1.5 text-center sm:border-l sm:border-border"
                : "flex flex-col items-center gap-1.5 text-center"
            }
          >
            <p className="font-display text-[2.4rem] leading-none font-bold text-accent">{metric.value}</p>
            <p className="max-w-[180px] text-[14px] text-muted-foreground">{metric.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
