"use client";

import { Tabs as RadixTabs } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's Tabs —
// no new dependency, same pattern as components/ui/popover.tsx/dialog.tsx.
export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("flex items-center gap-1 border-b-2 border-border", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "-mb-0.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] data-[state=active]:border-accent data-[state=active]:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("mt-6 focus:outline-none", className)} {...props} />;
}
