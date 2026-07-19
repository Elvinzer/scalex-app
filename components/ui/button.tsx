import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Reserved for the single priority action per screen — a soft
        // gradient fill + colored glow that deepens on hover, instead of a
        // flat coral aplat.
        default:
          "border-transparent text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--accent-border),0_6px_16px_var(--accent-glow)] [background:var(--gradient-accent)] hover:brightness-105 hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--accent-border),0_10px_28px_var(--accent-glow)] hover:-translate-y-px",
        // Second brand accent — violet gradient, same treatment, for
        // analytics/IA-flavored actions.
        accent2:
          "border-transparent text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--accent-2-border),0_6px_16px_var(--accent-2-glow)] [background:var(--gradient-accent-2)] hover:brightness-105 hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--accent-2-border),0_10px_28px_var(--accent-2-glow)] hover:-translate-y-px",
        outline:
          "border-border bg-card text-foreground hover:border-border-hover hover:shadow-sm hover:-translate-y-px aria-expanded:bg-muted",
        secondary:
          "border-border bg-card text-foreground hover:border-border-hover hover:bg-surface-sunken hover:shadow-sm hover:-translate-y-px aria-expanded:bg-muted",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "border-transparent text-muted-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
