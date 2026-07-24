"use client";

import falcoBust from "@/assets/falco/falco-bust.png";
import { FALCO_SKIN_ALT, type FalcoSkinKey } from "@/lib/falco-skins";
import { cn } from "@/lib/utils";

// Plain <picture>/<img> rather than next/image: these are pre-compressed
// (webp q82 + png fallback, generated once by scripts/prepare-falco-skins.mjs)
// assets we already control the exact bytes/format of, and a manual crossfade
// (components/floating-chat-bubble.tsx) is simpler to reason about with raw
// <img> elements than through next/image's own loading/placeholder behavior.
export function FalcoSkinImage({
  skin,
  portrait = false,
  sizePx,
  alt,
  priority = false,
  className,
}: {
  skin: FalcoSkinKey;
  portrait?: boolean;
  sizePx: number;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const dir = portrait ? "portraits" : "";
  const name = portrait ? `falco-portrait-${skin}` : `falco-skin-${skin}`;
  const base = `/falco/skins/${dir ? `${dir}/` : ""}${name}`;

  return (
    <picture>
      <source type="image/webp" srcSet={`${base}.webp 1x, ${base}@2x.webp 2x`} />
      <img
        src={`${base}.png`}
        srcSet={`${base}.png 1x, ${base}@2x.png 2x`}
        alt={alt ?? FALCO_SKIN_ALT[skin]}
        width={sizePx}
        height={sizePx}
        loading={priority ? "eager" : "lazy"}
        className={cn("shrink-0 select-none object-contain", className)}
        style={{ width: sizePx, height: sizePx }}
        onError={(event) => {
          // Silent fallback to the base Falco bust — belt-and-suspenders on
          // top of resolveFalcoSkin() only ever returning known-good keys,
          // in case an asset is ever removed/renamed without updating code.
          event.currentTarget.onerror = null;
          event.currentTarget.srcset = "";
          event.currentTarget.src = falcoBust.src;
        }}
      />
    </picture>
  );
}
