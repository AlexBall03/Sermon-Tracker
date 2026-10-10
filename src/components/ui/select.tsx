"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; options: readonly SelectOption[] };

type SelectProps = {
  /** Names the control for assistive technology; there is no visible label. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly SelectOption[];
  /** Options under headings, instead of `options`. */
  groups?: readonly SelectGroup[];
  /**
   * `grid` lays short options (chapter and verse numbers) out in rows, so a
   * hundred of them are a glance and a click instead of a long scroll.
   */
  layout?: "list" | "grid";
  disabled?: boolean;
  className?: string;
};

const item =
  "flex cursor-pointer items-center rounded-md text-sm outline-none select-none data-highlighted:bg-accent aria-selected:bg-primary-soft aria-selected:font-semibold aria-selected:text-primary";

/**
 * A dropdown for picking one of a known set. It replaces the browser's own
 * `<select>`, whose menu cannot be styled: the trigger matches `Input`, the
 * chevron sits inside its padding, and the menu is the same glass as the
 * other floating layers. Keyboard and screen-reader behaviour are Base UI's.
 */
export function Select({
  label,
  value,
  onChange,
  options = [],
  groups,
  layout = "list",
  disabled,
  className,
}: SelectProps) {
  const all = groups ? groups.flatMap((group) => group.options) : options;
  const grid = layout === "grid";

  const renderOption = (option: SelectOption) => (
    <SelectPrimitive.Item
      key={option.value}
      value={option.value}
      className={cn(
        item,
        grid
          ? "h-9 justify-center tabular-nums pointer-coarse:h-11"
          : "min-h-9 gap-2 py-1.5 pr-2 pl-2.5 pointer-coarse:min-h-11",
      )}
    >
      <SelectPrimitive.ItemText className={grid ? undefined : "min-w-0 flex-1 truncate"}>
        {option.label}
      </SelectPrimitive.ItemText>
      {!grid && (
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      )}
    </SelectPrimitive.Item>
  );

  return (
    <SelectPrimitive.Root
      items={all}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-surface pr-2.5 pl-3 text-left text-base shadow-card transition-[border-color,box-shadow] duration-200 outline-none hover:border-foreground/30 focus-visible:border-ring focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 data-popup-open:border-ring data-popup-open:shadow-focus md:text-sm",
          className,
        )}
      >
        <SelectPrimitive.Value className="min-w-0 truncate" />
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown className="size-4" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          sideOffset={6}
          collisionPadding={12}
          className="isolate z-50 outline-none"
        >
          <SelectPrimitive.Popup
            className={cn(
              "max-h-[min(var(--available-height),21rem)] origin-(--transform-origin) scroll-quiet overflow-y-auto overscroll-contain rounded-xl glass-float p-1.5 text-popover-foreground duration-150 outline-none [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              grid ? "w-72 max-w-(--available-width)" : "min-w-(--anchor-width)",
            )}
          >
            {groups ? (
              groups.map((group) => (
                <SelectPrimitive.Group key={group.label} className="not-first:mt-1.5">
                  <SelectPrimitive.GroupLabel className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </SelectPrimitive.GroupLabel>
                  {group.options.map(renderOption)}
                </SelectPrimitive.Group>
              ))
            ) : (
              <div className={grid ? "grid grid-cols-6 gap-0.5" : undefined}>
                {all.map(renderOption)}
              </div>
            )}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
