import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  info,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: { label: string; direction?: "up" | "down" | "stable"; tone?: KpiTone };
  tone?: KpiTone;
  className?: string;
  info?: { ariaLabel: string; content: string };
  children?: React.ReactNode;
}) {
  const deltaTone = delta?.tone ?? (delta?.direction === "up" ? "positive" : delta?.direction === "down" ? "negative" : "default");

  return (
    <article className={cn("sticker-card flex min-h-28 flex-col p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={info.ariaLabel}
                className="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent/60"
              >
                <Info className="size-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-64 text-xs leading-5">
              {info.content}
            </PopoverContent>
          </Popover>
        )}
      </div>
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
