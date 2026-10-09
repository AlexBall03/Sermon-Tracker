import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, restyled for Sermon Tracker.
 * For navigation, apply `buttonVariants()` to a `<Link>` instead of nesting.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-card inset-shadow-[0_1px_0_rgb(255_255_255/0.18)] hover:bg-primary/90 hover:shadow-glow",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "border border-input bg-surface text-foreground shadow-card hover:border-primary/50 hover:bg-muted",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-4",
        default: "h-10 px-5",
        lg: "h-12 px-7 text-base",
        icon: "size-9",
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
