import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, restyled for Sermon Tracker.
 * For navigation, apply `buttonVariants()` to a `<Link>` instead of nesting.
 * Hover changes colour and shadow only, in 200ms; every variant presses in
 * slightly on click, and a trailing icon nudges forward on hover.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-200 ease-out select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 [&_svg:last-child]:group-hover/button:translate-x-0.5 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          // Hover is a colour step only: no ring and no glow.
          "bg-primary text-primary-foreground shadow-card inset-shadow-[0_1px_0_rgb(255_255_255/0.16)] hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-foreground/12",
        outline:
          "border border-input bg-surface text-foreground shadow-card hover:border-primary/70 hover:bg-background",
        ghost: "text-foreground hover:bg-accent",
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:brightness-110 dark:hover:brightness-105",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        // 44px on touch screens; the compact sizes are for a pointer.
        sm: "h-9 px-4 pointer-coarse:h-11",
        default: "h-10 px-5",
        lg: "h-12 px-6 text-[0.9375rem]",
        icon: "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
