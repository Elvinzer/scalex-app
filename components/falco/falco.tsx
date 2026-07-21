import Image from "next/image";
import { cva } from "class-variance-authority";

import falcoAssistant from "@/assets/falco/falco-assistant.png";
import falcoBust from "@/assets/falco/falco-bust.png";
import falcoDashboard from "@/assets/falco/falco-dashboard.png";
import falcoFlying from "@/assets/falco/falco-flying.png";
import falcoHero from "@/assets/falco/falco-hero.png";
import falcoInsights from "@/assets/falco/falco-insights.png";
import { cn } from "@/lib/utils";

const FALCO_ASSETS = {
  hero: { src: falcoHero, alt: "Falco, la mascotte Scale X" },
  dashboard: { src: falcoDashboard, alt: "Falco, bras croisés, confiant devant les chiffres" },
  assistant: { src: falcoAssistant, alt: "Falco sur son laptop, ton copilote IA" },
  flying: { src: falcoFlying, alt: "Falco en plein vol" },
  insights: { src: falcoInsights, alt: "Falco qui montre une courbe de croissance" },
  bust: { src: falcoBust, alt: "Falco, ton copilote IA" },
} as const;

export type FalcoVariant = keyof typeof FALCO_ASSETS;

const SIZE_PX = { sm: 40, md: 96, lg: 192, xl: 288 } as const;
const BUST_SIZE_PX = { sm: 40, md: 56, lg: 80, xl: 112 } as const;
const BUST_SIZE_CLASS = { sm: "size-10", md: "size-14", lg: "size-20", xl: "size-28" } as const;

const falcoVariants = cva("shrink-0 select-none", {
  variants: {
    size: {
      sm: "w-10 h-auto",
      md: "w-24 h-auto",
      lg: "w-48 h-auto",
      xl: "w-72 h-auto",
    },
    animate: {
      none: "",
      idle: "falco-idle",
      float: "falco-float",
      "fly-loop": "falco-fly-loop",
      enter: "falco-enter",
    },
  },
  defaultVariants: {
    size: "md",
    animate: "none",
  },
});

type FalcoSize = keyof typeof SIZE_PX;
type FalcoAnimate = "none" | "idle" | "float" | "fly-loop" | "enter";

export function Falco({
  variant,
  size = "md",
  animate = "none",
  priority,
  alt,
  className,
}: {
  variant: FalcoVariant;
  size?: FalcoSize;
  animate?: FalcoAnimate;
  priority?: boolean;
  alt?: string;
  className?: string;
}) {
  const asset = FALCO_ASSETS[variant];
  const isBust = variant === "bust";

  return (
    <Image
      src={asset.src}
      alt={alt ?? asset.alt}
      priority={priority}
      sizes={`${isBust ? BUST_SIZE_PX[size] : SIZE_PX[size]}px`}
      className={cn(
        falcoVariants({ size, animate }),
        isBust && cn(BUST_SIZE_CLASS[size], "rounded-full object-cover object-top"),
        className
      )}
    />
  );
}
