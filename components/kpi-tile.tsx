import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export type KpiTone = "default" | "positive" | "negative" | "warning" | "accent2";

const toneClasses: Record<KpiTone, string> = {
  default: "text-foreground",
  positive: "text-state-healthy",
  negative: "text-state-critical",
  warning: "text-state-caution",
  accent2: "text-accent-2-text",
};

export function KpiTile({
  label,
  value,
  detail,
  delta,
  tone = "default",
  className,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: { label: string; direction?: "up" | "down" | "stable"; tone?: KpiTone };
  tone?: KpiTone;
  className?: string;
  children?: React.ReactNode;
}) {
  const deltaTone = delta?.tone ?? (delta?.direction === "up" ? "positive" : delta?.direction === "down" ? "negative" : "default");

  return (
    <article className={cn("sticker-card flex min-h-28 flex-col p-4", className)}>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-[-0.02em]", toneClasses[tone])}>{value}</p>
      {delta ? (
        <p className={cn("mt-1 flex items-center gap-1 text-xs font-bold", toneClasses[deltaTone])}>
          {delta.direction === "up" && <ArrowUp className="size-3" aria-hidden="true" />}
          {delta.direction === "down" && <ArrowDown className="size-3" aria-hidden="true" />}
          {delta.direction === "stable" && <Minus className="size-3" aria-hidden="true" />}
          {delta.label}
        </p>
      ) : detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
      {children}
    </article>
  );
}
