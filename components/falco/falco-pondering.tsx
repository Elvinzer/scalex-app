import { cn } from "@/lib/utils";

import { Falco, type FalcoPose, type FalcoSize } from "./falco";

// Replaces the old static "Falco réfléchit…" text wherever a Falco is shown
// during an async wait (Copilote reply, import analyze/commit, saving a
// discovery/onboarding answer). Bounded entirely by `isLoading` — the dot
// wave (.falco-pondering-dot, app/globals.css) only ever exists in the DOM
// while this is true, never a standalone infinite loop in markup.
export function FalcoPondering({
  isLoading,
  pose = "thinking",
  size = "xs",
  label = "Falco réfléchit…",
  className,
}: {
  isLoading: boolean;
  pose?: FalcoPose;
  size?: FalcoSize;
  label?: string;
  className?: string;
}) {
  if (!isLoading) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Falco pose={pose} size={size} />
      <span className="inline-flex items-center gap-1" role="status" aria-label={label}>
        <span aria-hidden className="falco-pondering-dot size-1.5 rounded-full bg-muted-foreground" />
        <span aria-hidden className="falco-pondering-dot size-1.5 rounded-full bg-muted-foreground" />
        <span aria-hidden className="falco-pondering-dot size-1.5 rounded-full bg-muted-foreground" />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
