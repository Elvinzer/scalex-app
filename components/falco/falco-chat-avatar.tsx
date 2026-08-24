"use client";

import { Falco } from "@/components/falco/falco";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import { cn } from "@/lib/utils";

export function FalcoChatAvatar({ skin, className, compact = false }: { skin?: FalcoSkinKey | null; className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted", compact ? "size-6" : "size-9", className)}>
      {skin ? (
        <Falco
          skin={skin}
          portrait
          skinSizePx={compact ? 24 : 32}
          priority
          className={cn("block rounded-full object-cover", compact ? "size-6" : "size-8")}
        />
      ) : (
        <Falco pose="neutral" size={compact ? "xs" : "sm"} />
      )}
    </span>
  );
}
