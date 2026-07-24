import { Mail, MessageCircle, Megaphone, Package, Phone, TrendingUp, Video, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Maps agents_registry.falco_skin_icon (a plain semantic key, DB-editable)
// to a lucide-react icon — the shipped "skin" today is this small badge
// next to Falco + the agent's name, not new character art (see
// components/falco/falco.tsx's falcoSkinAssetKey comment for the future
// illustrated-skin extension point).
const ICON_MAP: Record<string, LucideIcon> = {
  mail: Mail,
  video: Video,
  "message-circle": MessageCircle,
  ad: Megaphone,
  phone: Phone,
  package: Package,
  "trending-up": TrendingUp,
};

export function LeverAgentIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Icon = ICON_MAP[iconKey] ?? Megaphone;
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-2-soft text-accent-2-text", className)}>
      <Icon className="size-3" />
    </span>
  );
}
