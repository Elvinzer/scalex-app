import { Dialog as RadixDialog } from "radix-ui";

import { cn } from "@/lib/utils";

// Right-slide panel on the same radix-ui Dialog primitives as
// components/ui/dialog.tsx — a separate file rather than a second
// positioning mode on that component, since the two layouts (centered
// modal vs. full-height side panel) don't share much beyond the primitive.
export const Drawer = RadixDialog.Root;
export const DrawerTrigger = RadixDialog.Trigger;
export const DrawerClose = RadixDialog.Close;
export const DrawerTitle = RadixDialog.Title;

export function DrawerContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="glass-overlay fixed inset-0 z-40 duration-[var(--motion-fast)] ease-[var(--ease-out)] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={cn(
          "elevated fixed top-0 right-0 z-50 flex h-full max-h-[100dvh] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overscroll-contain border-l-2 border-(--border-value) bg-card pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 duration-[var(--motion-fast)] ease-[var(--ease-out)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className
        )}
        style={style}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
