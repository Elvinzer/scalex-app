import { Falco } from "@/components/falco/falco";
import { cn } from "@/lib/utils";

export function FalcoEmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sticker-card-dashed flex items-start gap-4 p-5", className)}>
      <Falco variant="assistant" size="sm" />
      <div className="flex-1">
        <p className="text-sm font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}
