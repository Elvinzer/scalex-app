import { Falco } from "@/components/falco/falco";
import { cn } from "@/lib/utils";

// Empty-state card. `showFalco` defaults true (md `sleeping` Falco — the
// system default for empty states), but is passed false on the Dashboard,
// which already carries its single content Falco in the hero (1-Falco-per-
// screen rule, see app/(app)/dashboard/page.tsx).
export function FalcoEmptyState({
  title,
  children,
  className,
  showFalco = true,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  showFalco?: boolean;
}) {
  return (
    <div className={cn("sticker-card-dashed flex items-start gap-4 p-5", className)}>
      {showFalco && <Falco pose="sleeping" size="md" animate="enter" />}
      <div className="flex-1">
        <p className="text-sm font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}
