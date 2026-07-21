"use client";

import { useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toPng } from "html-to-image";

import { MetricHealthCard } from "@/components/metric-health-card";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";
import type { MetricHealthCard as MetricHealthCardData } from "@/lib/diagnostic/cascade";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD_PX = 40;
const CARD_WIDTH_PX = 340;
const EXPORT_WIDTH_PX = 1080; // export target is 1080x1350 (4:5 portrait) — height follows from the card's own aspect-[4/5]

export function MetricHealthCarousel({ cards, auditUrl }: { cards: MetricHealthCardData[]; auditUrl: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const touchStartX = useRef<number | null>(null);

  const goTo = (index: number) => setActiveIndex(((index % cards.length) + cards.length) % cards.length);
  const goPrev = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
      if (delta > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  const activeCard = cards[activeIndex];

  const handleShare = async () => {
    const node = cardRefs.current[activeIndex];
    if (!node || isExporting) return;

    trackClient("metric_card_share_opened", { metric_key: activeCard.key });
    setIsExporting(true);
    try {
      // Card is rendered at CARD_WIDTH_PX on screen (aspect-[4/5]) — scale it
      // up via pixelRatio to hit the spec's 1080x1350 export, no separate
      // off-screen clone needed.
      const dataUrl = await toPng(node, {
        pixelRatio: EXPORT_WIDTH_PX / CARD_WIDTH_PX,
      });
      const link = document.createElement("a");
      link.download = `scalex-${activeCard.key}.png`;
      link.href = dataUrl;
      link.click();
      trackClient("metric_card_shared", { metric_key: activeCard.key, tier: getHealthTier(activeCard.score).tier });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Métrique précédente"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="w-[340px] overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="flex transition-transform duration-[320ms] ease-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {cards.map((card, index) => (
              <div key={card.key} className="w-full shrink-0" aria-hidden={index !== activeIndex}>
                <MetricHealthCard
                  ref={(el) => {
                    cardRefs.current[index] = el;
                  }}
                  card={card}
                  auditUrl={auditUrl}
                  hideAmounts={hideAmounts}
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label="Métrique suivante"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {cards.map((card, index) => (
          <button
            key={card.key}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Aller à ${card.label}`}
            className={cn("h-1.5 rounded-full transition-all", index === activeIndex ? "w-6 bg-accent" : "w-1.5 bg-border")}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button variant="secondary" onClick={handleShare} disabled={isExporting}>
          {isExporting ? "Export en cours…" : "Partager cette carte"}
        </Button>
        <label className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <input
            type="checkbox"
            checked={hideAmounts}
            onChange={(event) => setHideAmounts(event.target.checked)}
            className="size-4 rounded border-border"
          />
          Masquer les montants
        </label>
      </div>
    </div>
  );
}
