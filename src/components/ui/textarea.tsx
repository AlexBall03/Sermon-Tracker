import * as React from "react";

import { cn } from "@/lib/utils";

/** A multi-line input styled as `Input` is. It grows with its content where the browser allows. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content max-h-72 min-h-24 w-full min-w-0 resize-y rounded-lg border border-input bg-surface px-3 py-2.5 text-base leading-relaxed shadow-card transition-[color,border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm md:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
