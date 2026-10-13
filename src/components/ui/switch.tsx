"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

type SwitchProps = {
  /** What is switched, shown beside the control and read as its name. */
  label: string;
  /** What switching it does, shown under the label and read with it. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * One thing that is on or off, changed the moment it is pressed. The whole
 * row is the control, so it is easy to reach on a touch screen; Space and
 * Enter work as on any button.
 */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: SwitchProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex min-h-11 w-full items-start justify-between gap-4 rounded-lg text-left disabled:cursor-default disabled:opacity-60",
        className,
      )}
    >
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground"
          >
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors duration-200 group-aria-checked:bg-primary"
      >
        <span className="size-5 rounded-full bg-surface-raised shadow-card transition-[translate,background-color] duration-200 group-aria-checked:translate-x-4 group-aria-checked:bg-primary-foreground dark:bg-foreground/80" />
      </span>
    </button>
  );
}
