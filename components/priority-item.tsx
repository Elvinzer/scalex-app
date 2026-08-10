import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatEur } from "@/lib/currency";
import type { DiagnosticPoint } from "@/lib/diagnostic/cascade";
import { cn } from "@/lib/utils";

export type LeverWinner = { leverKey: string; label: string; category: string; monthlyGainEur: number; isActive: boolean };

type PriorityItemProps =
  | { rank: 1 | 2 | 3; point: DiagnosticPoint; leverWinner?: undefined }
  | { rank: 1 | 2 | 3; point?: undefined; leverWinner: LeverWinner };

// The priority engine's #1 pick (lib/diagnostic/priority.ts) can be a lever
// opportunity rather than one of the 5 cascade metrics — this component
// stays the one canonical priority row for both, instead of forking a
// near-duplicate for the lever case.
export function PriorityItem({ rank, point, leverWinner }: PriorityItemProps) {
  const locale = useLocale();
  const t = useTranslations("diagnostic.priority");
  if (leverWinner) {
    const isTop = rank === 1;
    return (
      <div
        className={cn(
          "sticker-card flex flex-col gap-4 p-6",
          isTop && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
                isTop ? "text-white shadow-[0_4px_14px_var(--accent-glow)]" : "bg-muted text-muted-foreground"
              )}
              style={isTop ? { background: "var(--gradient-accent)" } : undefined}
            >
              {rank}
            </span>
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{leverWinner.category}</p>
              <p className="mt-0.5 font-bold">{leverWinner.label}</p>
              <p className="mt-1 text-sm font-bold text-muted-foreground">
                {leverWinner.isActive ? t("activeBelow") : t("notActive")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
            <span className="rounded-full bg-positive-soft px-3 py-1 text-sm font-bold whitespace-nowrap text-positive tabular-nums">
              ≈{formatEur(leverWinner.monthlyGainEur, locale)}{t("perMonth")}
            </span>
            {isTop ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/diagnostic?openLever=${leverWinner.leverKey}&openLeverLabel=${encodeURIComponent(leverWinner.label)}`} prefetch={true}>
                  {t("improve")}
                </Link>
              </Button>
            ) : (
              <Link href="/diagnostic" prefetch={true} className="text-sm font-bold text-muted-foreground hover:underline">
                {t("seeDetail")}
              </Link>
            )}
          </div>
        </div>

        {isTop && (
          <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
            <Falco pose="alert" size="xs" animate="enter" />
            <FalcoBubble arrow="left" className="max-w-none flex-1">
              {t("recommend")}
            </FalcoBubble>
          </div>
        )}
      </div>
    );
  }

  const isTop = rank === 1;

  return (
    <div
      className={cn(
        "sticker-card flex flex-col gap-4 p-6",
        isTop && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
              isTop ? "text-white shadow-[0_4px_14px_var(--accent-glow)]" : "bg-muted text-muted-foreground"
            )}
            style={isTop ? { background: "var(--gradient-accent)" } : undefined}
          >
            {rank}
          </span>
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {point.category}
            </p>
            <p className="mt-0.5 font-bold">{point.label}</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">{point.explanation}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <span
            className="rounded-full bg-positive-soft px-3 py-1 text-sm font-bold whitespace-nowrap text-positive tabular-nums"
            title={point.tooltip}
          >
            {point.monthlyGain === null ? "+" + point.extraClients + ` ${t("clientsPerMonth")}` : `+${formatEur(point.monthlyGain, locale)}${t("perMonth")}`}
          </span>
          {isTop ? (
            // Secondary, not coral — the page's one coral CTA is the hero
            // banner's "Récupérer ce cash →", which already points here.
            <Button asChild size="sm" variant="secondary">
              <Link href={`/diagnostic?open=${point.key}`} prefetch={true}>{t("improve")}</Link>
            </Button>
          ) : (
            <Link href="/diagnostic" prefetch={true} className="text-sm font-bold text-muted-foreground hover:underline">
              {t("seeDetail")}
            </Link>
          )}
        </div>
      </div>

      {isTop && (
        <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
          <Falco pose="alert" size="xs" animate="enter" />
          <FalcoBubble arrow="left" className="max-w-none flex-1">
            {t("recommend")}
          </FalcoBubble>
        </div>
      )}
    </div>
  );
}
