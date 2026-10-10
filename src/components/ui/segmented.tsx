"use client";

import { cn } from "@/lib/utils";

export type SegmentedOption<Value extends string> = { value: Value; label: string };

type SegmentedProps<Value extends string> = {
  /** Names the group for assistive technology; shown above it unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  /** Radio group name: unique among the groups in one form. */
  name: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * A choice between a few options, shown side by side. Native radio buttons,
 * so arrow keys, forms, and screen readers behave as they expect; the look
 * matches the theme control.
 */
export function Segmented<Value extends string>({
  label,
  hideLabel = false,
  name,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: SegmentedProps<Value>) {
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className={hideLabel ? "sr-only" : "mb-2 text-sm leading-none font-medium"}>
        {label}
      </legend>
      <div className="flex gap-0.5 rounded-lg bg-secondary p-0.5">
        {options.map((option) => (
          <label key={option.value} className="min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex h-9 cursor-pointer items-center justify-center truncate rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 peer-checked:cursor-default peer-checked:bg-surface-raised peer-checked:text-foreground peer-checked:shadow-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-default peer-disabled:opacity-50 not-peer-checked:hover:bg-accent not-peer-checked:hover:text-foreground not-peer-checked:active:bg-foreground/10 dark:peer-checked:bg-foreground/10 pointer-coarse:h-11">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
