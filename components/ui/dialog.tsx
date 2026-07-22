import { Dialog as RadixDialog } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's Dialog —
// no new dependency. Escape/overlay-click-to-close is handled natively by
// Radix via onOpenChange; callers that need an unsaved-changes guard
// intercept that callback themselves rather than fighting the primitive.
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogTitle = RadixDialog.Title;

export function DialogContent({
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
          "sticker-card elevated fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 duration-[var(--motion-fast)] ease-[var(--ease-out)] focus:outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95",
          className
        )}
        style={{ borderTop: "2px solid var(--accent)", ...style }}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
