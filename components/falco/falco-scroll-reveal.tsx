"use client";

import { Falco } from "@/components/falco/falco";
import { useInView } from "@/lib/hooks/use-in-view";
import { cn } from "@/lib/utils";

// Wraps a section item (a "how it works" step, a feature...) so it fades
// in on scroll with a small Falco badge, instead of appearing flat.
export function FalcoScrollReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, isInView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <div ref={ref} className={cn("relative", isInView ? "falco-enter" : "opacity-0", className)}>
      {children}
      {isInView && <Falco variant="bust" size="sm" className="absolute -top-3 -right-3" />}
    </div>
  );
}
