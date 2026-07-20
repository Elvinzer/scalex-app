import {
  getActivationFunnel,
  getMedianActivationMinutes,
  getNorthStarCount,
  getNorthStarTrend,
  getTwoWeekRetentionRate,
} from "@/lib/posthog-query";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("Admin dashboard query failed", error);
    return null;
  }
}

export default async function AdminPage() {
  const [northStarCount, northStarTrend, funnel, medianMinutes, retentionRate] = await Promise.all([
    safe(getNorthStarCount),
    safe(getNorthStarTrend),
    safe(getActivationFunnel),
    safe(getMedianActivationMinutes),
    safe(getTwoWeekRetentionRate),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Dashboard fondateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">La boucle de valeur, mesurée.</p>
      </div>

      <div className="sticker-card p-6">
        <p className="text-sm font-bold text-muted-foreground">
          North star — utilisateurs avec ≥ 1 conversation d&apos;amélioration cette semaine
        </p>
        <p className="mt-2 font-display text-3xl font-bold tabular-nums">
          {northStarCount === null ? "—" : northStarCount}
        </p>
        {northStarTrend && northStarTrend.length > 0 && (
          <div className="mt-4 flex items-end gap-1.5">
            {northStarTrend.map((week) => (
              <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-accent/70"
                  style={{ height: `${Math.max(week.count * 8, 4)}px` }}
                  title={`${week.weekStart}: ${week.count}`}
                />
                <span className="text-[10px] text-muted-foreground">{week.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sticker-card p-6">
        <p className="text-sm font-bold text-muted-foreground">
          Funnel d&apos;activation — cohorte des 30 derniers jours
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {funnel === null ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            funnel.map((step, index) => {
              const previous = index > 0 ? funnel[index - 1].count : null;
              const percent = previous && previous > 0 ? Math.round((step.count / previous) * 100) : null;
              return (
                <div key={step.step} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-bold">{step.step}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-bold tabular-nums">{step.count}</span>
                    {percent !== null && <span className="text-xs text-muted-foreground">{percent}% du précédent</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card p-6">
          <p className="text-sm font-bold text-muted-foreground">Temps médian signup → activation</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {medianMinutes === null ? "—" : `${Math.round(medianMinutes)} min`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Objectif : moins de 15 min</p>
        </div>

        <div className="sticker-card p-6">
          <p className="text-sm font-bold text-muted-foreground">Check-in 2 semaines de suite</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {retentionRate === null ? "—" : `${retentionRate}%`}
          </p>
        </div>
      </div>
    </div>
  );
}
