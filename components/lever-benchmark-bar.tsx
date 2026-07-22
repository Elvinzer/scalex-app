// 3-zone graduation bar (rouge/ambre/vert) showing where a lever's KPI
// typically lands in the market — same 3-tier color language as
// getHealthTier elsewhere in the app (state-critical/caution/healthy), not
// a 4th color for "excellent": that tier is shown as a small marker inside
// the green zone instead of its own color, per confirmed direction.
export function LeverBenchmarkBar({
  badMax,
  okMax,
  excellentAt,
  currentValue,
  centralLabel,
}: {
  badMax: number;
  okMax: number;
  excellentAt?: number;
  currentValue?: number | null; // 0-1 fraction — only known for "actifs à surveiller"
  centralLabel?: string;
}) {
  const badWidth = Math.min(badMax, 1) * 100;
  const okWidth = Math.max(0, Math.min(okMax, 1) - Math.min(badMax, 1)) * 100;
  const goodWidth = Math.max(0, 100 - badWidth - okWidth);
  const excellentLeft = excellentAt !== undefined ? Math.min(Math.max(excellentAt, 0), 1) * 100 : null;
  const currentLeft = currentValue !== undefined && currentValue !== null ? Math.min(Math.max(currentValue, 0), 1) * 100 : null;

  return (
    <div className="flex flex-col gap-1.5">
      {centralLabel && (
        <p className="text-xs text-muted-foreground">
          Standard du marché : <span className="font-bold text-foreground">{centralLabel}</span>
        </p>
      )}
      <div className="relative h-2 overflow-visible rounded-full">
        <div className="flex h-full w-full overflow-hidden rounded-full">
          <div className="h-full bg-state-critical" style={{ width: `${badWidth}%` }} />
          <div className="h-full bg-state-caution" style={{ width: `${okWidth}%` }} />
          <div className="h-full bg-state-healthy" style={{ width: `${goodWidth}%` }} />
        </div>
        {excellentLeft !== null && (
          <div
            aria-hidden
            className="absolute top-0 h-2 w-px bg-white/70"
            style={{ left: `${excellentLeft}%` }}
          />
        )}
        {currentLeft !== null && (
          <div
            aria-hidden
            className="absolute -top-0.5 size-3 -translate-x-1/2 rounded-full border-2 border-white bg-ink shadow-sm"
            style={{ left: `${currentLeft}%` }}
          />
        )}
      </div>
      {excellentLeft !== null && (
        <p className="text-right text-[10px] text-muted-foreground">excellent à partir de {Math.round((excellentAt ?? 0) * 100)}%</p>
      )}
    </div>
  );
}
