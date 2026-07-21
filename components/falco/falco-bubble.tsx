import { cn } from "@/lib/utils";

// Speech bubble attached to Falco. Design-system compliant: no offset drop
// shadow (only --shadow-float when it genuinely floats over content), tokens
// only — the dark variant uses --surface-dark-2 (the spec's raw #211F18 is
// not a token) with a subtle white border rather than introducing new hex.
// `arrow` is the edge the little pointer sits on (pointing toward Falco).
export function FalcoBubble({
  children,
  onDark = false,
  arrow = "left",
  floating = false,
  className,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  // "none" = no pointer (used in the onboarding thread, where a single Falco
  // sits above a column of bubbles rather than beside each one).
  arrow?: "left" | "right" | "none";
  floating?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative max-w-[240px] rounded-[var(--radius-card)] border px-4 py-3 text-sm font-bold",
        onDark
          ? "border-white/10 bg-[var(--surface-dark-2)] text-[var(--text-on-dark)]"
          : "border-border bg-surface text-foreground",
        floating && "shadow-[var(--shadow-float)]",
        className
      )}
    >
      {arrow !== "none" && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 border",
            onDark ? "border-white/10 bg-[var(--surface-dark-2)]" : "border-border bg-surface",
            arrow === "left" ? "left-0 -translate-x-1/2 border-t-0 border-r-0" : "right-0 translate-x-1/2 border-b-0 border-l-0"
          )}
        />
      )}
      {children}
    </div>
  );
}
