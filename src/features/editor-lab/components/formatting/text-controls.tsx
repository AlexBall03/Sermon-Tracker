"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import {
  fontSizeSteps,
  parseFontSize,
  setFontFamily,
  setFontSize,
  setNamedStyle,
  steppedSize,
} from "../../formatting-commands";
import { componentLook, mixed, type BlockState, type TextState } from "../../formatting-state";
import {
  fontCategories,
  fontRegistry,
  isFontKey,
  namedStyles,
  type FontKey,
  type NamedStyle,
} from "../../styles/model";
import type { useKeptSelection } from "./keep-selection";
import { Tool } from "../toolbar";

/*
 * The paragraph style, font, and size controls (PS-1B.2B.2B). Each one
 * remembers the selection as it takes focus and applies to it (`keep-selection.ts`);
 * a mixed selection shows no single value.
 */

type Keeper = ReturnType<typeof useKeptSelection>;

/**
 * The paragraph style; in a title, a note, or a script it rests, showing that
 * the component governs. On a schema v4 point heading it is the point's look:
 * "Component style" (its component's own) or a named style; it stays a point.
 */
export function StyleSelect({ state, keeper }: { state: BlockState; keeper: Keeper }) {
  const t = useT("editorLab").format;
  const governed = state.style === null;
  const value = state.style === null ? componentLook : state.style === mixed ? "" : state.style;
  const options = governed
    ? [{ value: componentLook, label: t.componentStyle }]
    : [
        ...(state.style === mixed ? [{ value: "", label: t.mixed }] : []),
        ...(state.component ? [{ value: componentLook, label: t.componentStyle }] : []),
        ...namedStyles
          .filter((name) => state.styles.includes(name))
          .map((name) => ({ value: name, label: t.styleNames[name] })),
      ];
  return (
    <div onFocusCapture={keeper.remember} onPointerDownCapture={keeper.remember}>
      <Select
        label={t.style}
        value={value}
        disabled={governed}
        onChange={(next) => {
          // Only a person's choice of another style: a menu whose options change can report its own value.
          if (next === componentLook) {
            if (state.component && state.style !== componentLook)
              keeper.choose(setNamedStyle(null));
            return;
          }
          const name = next as NamedStyle;
          if (state.styles.includes(name) && name !== state.style)
            keeper.choose(setNamedStyle(name));
        }}
        options={options}
        finalFocus={keeper.finalFocus}
        className="h-9 w-36"
      />
    </div>
  );
}

export function FontSelect({ state, keeper }: { state: TextState; keeper: Keeper }) {
  const t = useT("editorLab").format;
  const keys = Object.keys(fontRegistry) as FontKey[];
  const groups = fontCategories.map((category) => ({
    label: t.fontCategories[category],
    options: keys
      .filter((key) => fontRegistry[key].category === category)
      .map((key) => ({ value: key, label: fontRegistry[key].name })),
  }));
  const value = state.fontFamily === mixed ? "" : state.fontFamily;
  return (
    <div
      onFocusCapture={keeper.remember}
      onPointerDownCapture={keeper.remember}
      data-inherited={state.inherited.fontFamily || undefined}
    >
      <Select
        label={t.font}
        value={value}
        onChange={(next) => {
          if (isFontKey(next) && next !== state.fontFamily) keeper.choose(setFontFamily(next));
        }}
        groups={
          value ? groups : [{ label: t.mixed, options: [{ value: "", label: t.mixed }] }, ...groups]
        }
        finalFocus={keeper.finalFocus}
        className="h-9 w-44"
      />
    </div>
  );
}

/**
 * The size: a field that takes any size from 4 to 144 points (rounded to the
 * half point, as the schema keeps it), a list of the usual ones, and a step
 * down and up. Enter applies and returns to the text; Escape returns without.
 */
export function SizeField({ state, keeper }: { state: TextState; keeper: Keeper }) {
  const t = useT("editorLab").format;
  const locale = useLocale();
  const shown = state.fontSize === mixed ? "" : formatNumber(locale, state.fontSize);
  // What is typed, only while it is being typed; otherwise the field follows the selection.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const listId = "lab-font-sizes";
  const current = state.fontSize === mixed ? null : state.fontSize;
  const commit = (text: string) => {
    const size = parseFontSize(text);
    setDraft(null);
    if (size === null) keeper.restore();
    else keeper.apply(setFontSize(size));
  };
  return (
    <div className="flex items-center" onPointerDownCapture={() => !editing && keeper.remember()}>
      <Tool
        label={t.smaller}
        icon={Minus}
        disabled={current === null || current <= 4}
        onPress={() => current !== null && keeper.apply(setFontSize(steppedSize(current, -1)))}
      />
      <Input
        aria-label={t.size}
        title={t.sizeHint}
        inputMode="decimal"
        list={listId}
        value={draft ?? shown}
        placeholder={state.fontSize === mixed ? "–" : undefined}
        onFocus={() => {
          keeper.remember();
          setDraft(shown);
        }}
        onChange={(event) => {
          // A size picked from the list applies at once, as a typed one does on Enter.
          if ((event.nativeEvent as InputEvent).inputType === "insertReplacementText") {
            commit(event.target.value);
            return;
          }
          setDraft(event.target.value);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft ?? shown);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
            keeper.restore();
          }
        }}
        className="h-9 w-14 px-2 text-center tabular-nums"
      />
      <datalist id={listId}>
        {fontSizeSteps.map((size) => (
          <option key={size} value={formatNumber(locale, size)} />
        ))}
      </datalist>
      <Tool
        label={t.larger}
        icon={Plus}
        disabled={current === null || current >= 144}
        onPress={() => current !== null && keeper.apply(setFontSize(steppedSize(current, 1)))}
      />
    </div>
  );
}
