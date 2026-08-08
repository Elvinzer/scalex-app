"use client";

import { ChevronDown } from "lucide-react";
import { Accordion as RadixAccordion } from "radix-ui";

import { cn } from "@/lib/utils";

// Minimal wrapper over the already-installed `radix-ui` package's Accordion
// — no new dependency, same wrapping convention as components/ui/dialog.tsx.
export const Accordion = RadixAccordion.Root;
export const AccordionItem = RadixAccordion.Item;

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Trigger>) {
  return (
    <RadixAccordion.Header className="flex min-w-0 flex-1">
      <RadixAccordion.Trigger
        className={cn(
          "group flex flex-1 items-center justify-between gap-2 py-3 text-left outline-none",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] group-data-[state=open]:rotate-180" />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixAccordion.Content>) {
  return (
    <RadixAccordion.Content
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("pb-4", className)}>{children}</div>
    </RadixAccordion.Content>
  );
}
