import { SourcePopover } from "@/components/source-popover";
import { cn } from "@/lib/utils";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

export type KpiFieldSource = { text: string; href?: string; linkLabel?: string };

// Shared by checkin-modal.tsx and month-modal.tsx (previously two near-
// identical local copies) — extended here with an optional disabledReason:
// when set, the field is read-only and shows a SourcePopover explaining
// where its value comes from, instead of asking for the same number twice.
export function KpiNumberField({
  label,
  value,
  onChange,
  warning,
  disabledReason,
  highlight = false,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  warning?: string;
  disabledReason?: KpiFieldSource;
  highlight?: boolean;
}) {
  const disabled = disabledReason !== undefined;

  return (
    <label className={cn("flex flex-col gap-1 text-sm", highlight && "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/40 p-2")}>
      <span className="flex items-center gap-1 font-bold">
        {label}
        {disabledReason && <SourcePopover {...disabledReason} />}
      </span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        disabled={disabled}
        autoFocus={highlight}
        aria-invalid={highlight || undefined}
        data-scale-score-target={highlight ? "true" : undefined}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={cn(inputClass, disabled && "cursor-not-allowed bg-muted text-muted-foreground", highlight && "border-accent ring-3 ring-accent/20")}
      />
      {warning && <span className="text-xs font-bold text-state-caution">{warning}</span>}
    </label>
  );
}
