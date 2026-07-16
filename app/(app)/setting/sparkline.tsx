// Pure inline SVG, server-rendered — a single series needs no legend, and a
// stat-tile sparkline needs no client JS, so this stays a plain function
// component (no "use client").
export function Sparkline({
  values,
  labels,
}: {
  values: number[];
  labels: string[];
}) {
  if (values.length < 2) {
    return <div className="h-10 w-full" aria-hidden="true" />;
  }

  const width = 160;
  const height = 40;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * (height - 6) - 3,
    value,
    label: labels[index],
  }));

  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = `0,${height} ${linePath} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full overflow-visible"
      role="img"
      aria-label={`Évolution sur les ${values.length} derniers jours`}
    >
      <polygon points={areaPath} fill="var(--signal)" opacity={0.12} />
      <polyline
        points={linePath}
        fill="none"
        stroke="var(--signal)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={5} fill="transparent">
          <title>
            {point.label} — {point.value}
          </title>
        </circle>
      ))}
    </svg>
  );
}
