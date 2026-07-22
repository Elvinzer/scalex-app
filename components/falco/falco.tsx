import Image from "next/image";
import { cva } from "class-variance-authority";

import falcoAssistant from "@/assets/falco/falco-assistant.png";
import falcoBust from "@/assets/falco/falco-bust.png";
import falcoDashboard from "@/assets/falco/falco-dashboard.png";
import falcoFlying from "@/assets/falco/falco-flying.png";
import falcoHero from "@/assets/falco/falco-hero.png";
import falcoInsights from "@/assets/falco/falco-insights.png";
import { cn } from "@/lib/utils";

import { FalcoBubble } from "./falco-bubble";

const FALCO_ASSETS = {
  hero: { src: falcoHero, alt: "Falco, la mascotte Scale X" },
  dashboard: { src: falcoDashboard, alt: "Falco, bras croisés, confiant devant les chiffres" },
  assistant: { src: falcoAssistant, alt: "Falco sur son laptop, ton copilote IA" },
  flying: { src: falcoFlying, alt: "Falco en plein vol" },
  insights: { src: falcoInsights, alt: "Falco qui montre une courbe de croissance" },
  bust: { src: falcoBust, alt: "Falco, ton copilote IA" },
} as const;

export type FalcoVariant = keyof typeof FALCO_ASSETS;

// Semantic pose → concrete asset. No dedicated "sleeping" art exists yet;
// it falls back to `assistant` (calm, non-alarming) — a future v2 asset
// (assets/falco/v2/, currently dormant) can be slotted in here without
// touching any call site. `pose` is the preferred prop for product usage;
// `variant` stays for the asset-specific marketing/404 pages.
export type FalcoPose = "neutral" | "happy" | "thinking" | "alert" | "sleeping";
const POSE_TO_VARIANT: Record<FalcoPose, FalcoVariant> = {
  neutral: "bust",
  happy: "insights",
  thinking: "assistant",
  alert: "dashboard",
  sleeping: "assistant",
};

const SIZE_PX = { xs: 24, sm: 40, md: 64, lg: 96, xl: 192 } as const;
const BUST_SIZE_PX = { xs: 24, sm: 40, md: 64, lg: 96, xl: 112 } as const;
const BUST_SIZE_CLASS = { xs: "size-6", sm: "size-10", md: "size-16", lg: "size-24", xl: "size-28" } as const;

const falcoVariants = cva("shrink-0 select-none", {
  variants: {
    size: {
      xs: "w-6 h-auto",
      sm: "w-10 h-auto",
      md: "w-16 h-auto",
      lg: "w-24 h-auto",
      xl: "w-48 h-auto",
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
  pose,
  variant,
  size = "md",
  animate = "none",
  priority,
  alt,
  className,
  withBubble = false,
  bubbleText,
  bubbleOnDark = false,
  bubbleSide = "right",
  bubbleClassName,
}: {
  pose?: FalcoPose;
  variant?: FalcoVariant;
  size?: FalcoSize;
  animate?: FalcoAnimate;
  priority?: boolean;
  alt?: string;
  className?: string;
  withBubble?: boolean;
  bubbleText?: string;
  bubbleOnDark?: boolean;
  // Which side the bubble sits relative to Falco.
  bubbleSide?: "left" | "right";
  // Overrides FalcoBubble's default max-w-[240px] — needed wherever
  // bubbleText is a full generated sentence rather than a short quip (that
  // default otherwise wraps/looks broken on long dynamic strings).
  bubbleClassName?: string;
}) {
  const resolvedVariant: FalcoVariant = pose ? POSE_TO_VARIANT[pose] : (variant ?? "bust");
  const asset = FALCO_ASSETS[resolvedVariant];
  const isBust = resolvedVariant === "bust";

  const image = (
    <Image
      src={asset.src}
      alt={alt ?? asset.alt}
      priority={priority}
      sizes={`${isBust ? BUST_SIZE_PX[size] : SIZE_PX[size]}px`}
      className={cn(
        falcoVariants({ size, animate }),
        isBust && cn(BUST_SIZE_CLASS[size], "rounded-full object-cover object-top"),
        !withBubble && className
      )}
    />
  );

  if (!withBubble || !bubbleText) return image;

  return (
    <div className={cn("flex items-center gap-3", bubbleSide === "left" && "flex-row-reverse", className)}>
      {image}
      <FalcoBubble onDark={bubbleOnDark} arrow={bubbleSide === "left" ? "right" : "left"} floating className={bubbleClassName}>
        {bubbleText}
      </FalcoBubble>
    </div>
  );
}
