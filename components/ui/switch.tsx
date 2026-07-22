import { Switch as RadixSwitch } from "radix-ui";

import { cn } from "@/lib/utils";

// Thin wrapper over the already-installed `radix-ui` package's Switch — no
// new dependency, same pattern as components/ui/dialog.tsx/drawer.tsx.
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: React.ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent bg-muted transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:ring-3 focus-visible:ring-accent/12 focus-visible:outline-none data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] data-[state=checked]:translate-x-5" />
    </RadixSwitch.Root>
  );
}
