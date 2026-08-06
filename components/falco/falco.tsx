"use client";

import Image from "next/image";
import { cva } from "class-variance-authority";

import falcoAssistant from "@/assets/falco/falco-assistant.png";
import falcoBust from "@/assets/falco/falco-bust.png";
import falcoDashboard from "@/assets/falco/falco-dashboard.png";
import falcoFlying from "@/assets/falco/falco-flying.png";
import falcoHero from "@/assets/falco/falco-hero.png";
import falcoInsights from "@/assets/falco/falco-insights.png";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import { cn } from "@/lib/utils";

import { FalcoBubble } from "./falco-bubble";
import { useFalcoAnimationsEnabled } from "./falco-context";
import { FalcoSkinImage } from "./falco-skin-image";

const FALCO_ASSETS = {
  hero: { src: falcoHero, alt: "Falco, la mascotte Scale X" },
  dashboard: { src: falcoDashboard, alt: "Falco, bras croisés, confiant devant les chiffres" },
  assistant: { src: falcoAssistant, alt: "Falco sur son laptop, ton copilote IA" },
  flying: { src: falcoFlying, alt: "Falco en plein vol" },
  insights: { src: falcoInsights, alt: "Falco qui montre une courbe de croissance" },
  bust: { src: falcoBust, alt: "Falco, ton copilote IA" },
} as const;

const FALCO_DIMENSIONS: Record<FalcoVariant, { width: number; height: number }> = {
  hero: { width: 784, height: 1119 },
  dashboard: { width: 640, height: 1177 },
  assistant: { width: 800, height: 1152 },
  flying: { width: 1216, height: 1032 },
  insights: { width: 862, height: 1187 },
  bust: { width: 800, height: 800 },
};

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

export type FalcoSize = keyof typeof SIZE_PX;
type FalcoAnimate = "none" | "idle" | "float" | "fly-loop" | "enter";

// Same animate→class mapping as falcoVariants above, but without its `size`
// half (which assumes the xs/sm/md/lg/xl scale calibrated for the SVG bust
// assets) — skins are sized explicitly via `skinSizePx` instead.
const ANIMATE_CLASS: Record<FalcoAnimate, string> = {
  none: "",
  idle: "falco-idle",
  float: "falco-float",
  "fly-loop": "falco-fly-loop",
  enter: "falco-enter",
};

export function Falco({
  pose,
  variant,
  skin,
  portrait = false,
  skinSizePx = 64,
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
  // Per-page illustrated skin (lib/falco-skins.ts) — when set, this takes
  // over rendering entirely (pose/variant/size are ignored) but the
  // withBubble wrapping below stays identical, so bubble-carrying call
  // sites (e.g. Diagnostic's verdict line) don't need any other change.
  skin?: FalcoSkinKey;
  // Renders the head/shoulders crop instead of the full-body skin (chat
  // bubble/drawer/message-avatar sizes). Ignored without `skin`.
  portrait?: boolean;
  // Explicit pixel size for skin/portrait — their real-world gabarits
  // (56-64/72-80/32/24px) don't line up with the xs/sm/md/lg/xl scale below.
  skinSizePx?: number;
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
  const imageWidth = isBust ? BUST_SIZE_PX[size] : SIZE_PX[size];
  const imageHeight = Math.round((imageWidth * FALCO_DIMENSIONS[resolvedVariant].height) / FALCO_DIMENSIONS[resolvedVariant].width);
  const animationsEnabled = useFalcoAnimationsEnabled();
  // Pose-aware entrance — replaces the generic `animate="enter"` fade with a
  // morph matching the pose whenever one is known (see lib/falco-motion.ts;
  // falco-morph-neutral is itself an alias of falco-settle, so pose="neutral"
  // call sites look identical to before). Remounting with a new `key` per
  // conversational turn is what replays this — no JS change-detection needed.
  // Skins are a single frame per key (no blink/expression variants), so this
  // morph is skipped for them — only the animate transform (breathing,
  // bounce...) still applies, via ANIMATE_CLASS below.
  const morphClass = !skin && pose && animationsEnabled ? `falco-morph-${pose}` : undefined;

  const image = skin ? (
    <FalcoSkinImage
      skin={skin}
      portrait={portrait}
      sizePx={skinSizePx}
      alt={alt}
      priority={priority}
      className={cn(ANIMATE_CLASS[animate], !withBubble && className)}
    />
  ) : (
    <Image
      src={asset.src}
      alt={alt ?? asset.alt}
      width={imageWidth}
      height={imageHeight}
      priority={priority}
      sizes={`${isBust ? BUST_SIZE_PX[size] : SIZE_PX[size]}px`}
      className={cn(
        falcoVariants({ size, animate }),
        morphClass,
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
