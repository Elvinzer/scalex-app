"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { useFalcoAnimationsEnabled } from "@/components/falco/falco-context";
import { FalcoSkinImage } from "@/components/falco/falco-skin-image";
import { ImproveChat } from "@/components/improve-chat";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { FALCO_SKIN_CHAT_LABEL, resolveAgentKeyForRoute, resolveFalcoSkin, type FalcoSkinKey } from "@/lib/falco-skins";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { cn } from "@/lib/utils";

const GENERAL_CONTEXT: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "global_bubble" };
const PORTRAIT_SIZE_PX = 44; // circle is 56px (size-14), leaves a small ring of padding around the portrait

// Crossfades between skin portraits as `skin` changes (navigation) — new
// layer fades in over the previous one, which is then dropped once the
// transition completes. No bidirectional fade-out needed for a convincing
// crossfade at this size. Skipped entirely (instant swap) when Falco
// animations are disabled (prefers-reduced-motion or the user's toggle).
function FalcoBubblePortrait({ skin }: { skin: FalcoSkinKey | null }) {
  const animationsEnabled = useFalcoAnimationsEnabled();
  const nextKey = useRef(1);
  const [layers, setLayers] = useState<{ key: number; skin: FalcoSkinKey | null }[]>([{ key: 0, skin }]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.skin === skin) return prev;
      if (!animationsEnabled) return [{ key: nextKey.current++, skin }];
      return [...prev, { key: nextKey.current++, skin }];
    });
  }, [skin, animationsEnabled]);

  useEffect(() => {
    if (layers.length <= 1) return;
    const timeout = setTimeout(() => setLayers((prev) => prev.slice(-1)), 260);
    return () => clearTimeout(timeout);
  }, [layers]);

  return (
    <span className="relative block size-full overflow-hidden rounded-full">
      {layers.map((layer, index) => (
        <FadeLayer key={layer.key} isTop={index === layers.length - 1} instant={!animationsEnabled}>
          {layer.skin ? (
            <FalcoSkinImage skin={layer.skin} portrait sizePx={PORTRAIT_SIZE_PX} priority className="size-full rounded-full object-cover" />
          ) : (
            <Falco variant="bust" size="sm" animate="none" className="size-full rounded-full object-cover" />
          )}
        </FadeLayer>
      ))}
    </span>
  );
}

function FadeLayer({ children, isTop, instant }: { children: React.ReactNode; isTop: boolean; instant: boolean }) {
  const [revealed, setRevealed] = useState(instant || !isTop);

  useEffect(() => {
    if (!isTop || instant) return;
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, [isTop, instant]);

  return (
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        !instant && "transition-opacity duration-[250ms] ease-out",
        revealed ? "opacity-100" : "opacity-0"
      )}
    >
      {children}
    </span>
  );
}

// Global "discuter de tes datas" launcher — available on every authenticated
// page (mounted once in app/(app)/layout.tsx). Opens the same chat drawer as
// the per-topic flow, but in general mode — the AI gets the user's full
// diagnostic instead of one specific point. The portrait/label reflect the
// CURRENT PAGE's skin (lib/falco-skins.ts) purely visually — clicking still
// always opens the same general Copilote context as before, unchanged.
//
// hasUnseenInsight (computed server-side in app/(app)/layout.tsx) drives the
// notification dot + pulsing glow — a proactive "the AI wants to tell you
// something" cue rather than a purely decorative bubble. Dismissed locally
// the moment the drawer is opened, for instant feedback, independent of
// when the underlying server-side signal itself clears.
export function FloatingChatBubble({ hasUnseenInsight = false }: { hasUnseenInsight?: boolean }) {
  const pathname = usePathname();
  const skin = resolveFalcoSkin(pathname);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showNotification = hasUnseenInsight && !dismissed;
  const chatLabel = skin ? FALCO_SKIN_CHAT_LABEL[skin] : "Falco, ton copilote IA";
  // Deep link to the full hub — precise (route→agent, not skin→agent, so no
  // ambiguity between e.g. Setting/Ads sharing the "acquisition" skin); a
  // page with no matching agent just links to the hub with no ?agent= param.
  const copiloteHref = (() => {
    const agentKey = resolveAgentKeyForRoute(pathname);
    return agentKey ? `/copilote?agent=${agentKey}` : "/copilote";
  })();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDismissed(true);
      void recordImproveChatOpened(GENERAL_CONTEXT);
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={showNotification ? `Falco a une remarque pour toi : discuter de tes datas` : `Ouvrir le chat avec ${chatLabel}`}
          className={cn(
            // Coral — deliberately breaks from the rest of the Copilote's
            // violet identity (drawer header, send button) for this one
            // launcher button only, per explicit user request.
            "group fixed right-6 bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-accent shadow-[var(--shadow-float)] ring-0 ring-accent transition-all duration-[150ms] ease-[var(--ease-out)] hover:scale-105 hover:ring-1",
            showNotification && "animate-[glow-pulse_2s_ease-in-out_infinite]"
          )}
        >
          <FalcoBubblePortrait skin={skin} />
          {showNotification && (
            <span className="absolute -top-1 -right-1 flex size-4">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-state-caution opacity-75" />
              <span className="relative inline-flex size-4 rounded-full border-2 border-surface bg-state-caution" />
            </span>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex justify-end border-b border-border px-4 py-2">
              <Link href={copiloteHref} className="text-xs font-bold text-muted-foreground hover:underline">
                Ouvrir dans le Copilote →
              </Link>
            </div>
            <div className="flex-1 overflow-hidden">
              <ImproveChat context={GENERAL_CONTEXT} period="3-months" gapBadge={null} falcoSkin={skin} />
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
