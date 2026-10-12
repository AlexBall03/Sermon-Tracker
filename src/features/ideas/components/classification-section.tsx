"use client";

import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { classificationOptions } from "../classification";
import { classificationDefaults } from "../model";
import type { IdeaDraft } from "../schemas";
import type { UpdateDraft } from "./idea-fields";

/** One classification: its name, its dropdown, and what the chosen value means. */
function Choice<Value extends string>({
  label,
  value,
  options,
  onChange,
  meaning,
  help,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  meaning: string;
  /** A control beside the name, such as the guide to the sermon types. */
  help?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex h-5 items-center gap-1">
        <span aria-hidden className="text-sm leading-none font-medium">
          {label}
        </span>
        {help}
      </div>
      <Select
        label={label}
        value={value}
        onChange={(next) => onChange(next as Value)}
        options={options}
        className="mt-2 w-full"
      />
      <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{meaning}</p>
    </div>
  );
}

/** What each sermon type means, with an example. Opens on a click, a tap, or the keyboard. */
function SermonTypeGuide() {
  const t = useT("ideas");
  const { sermonTypes } = classificationOptions(useLocale());
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t.fields.sermonTypeHelp}
        className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground pointer-coarse:size-9"
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <PopoverTitle className="text-sm font-semibold">
          {t.fields.sermonTypeHelpTitle}
        </PopoverTitle>
        <dl className="mt-3 space-y-3">
          {sermonTypes.map((type) => (
            <div key={type.value}>
              <dt className="text-sm font-semibold">{type.label}</dt>
              <dd className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {type.definition}
                {type.example && (
                  <span className="mt-1 block">
                    <span className="font-medium text-foreground">{t.fields.example}</span>{" "}
                    {type.example}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t pt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {t.sermonTypeNote}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An idea's classifications, put away until wanted: its status, and for a
 * sermon its intended format and its type. Closed, it says what they are in
 * one line. A point or an undecided idea has a status only; the format and
 * type its draft holds are kept, unseen, as its subject is.
 *
 * Nothing here saves. It changes the draft, and the form it sits in saves.
 */
export function ClassificationSection({
  draft,
  update,
  defaultOpen = false,
}: {
  draft: IdeaDraft;
  update: UpdateDraft;
  defaultOpen?: boolean;
}) {
  const id = useId();
  const t = useT("ideas");
  const options = classificationOptions(useLocale());
  const [open, setOpen] = useState(defaultOpen);
  const sermon = draft.kind === "sermon";

  const status = options.statuses.find((option) => option.value === draft.status);
  const format = options.formats.find((option) => option.value === draft.intendedFormat);
  const type = options.sermonTypes.find((option) => option.value === draft.sermonType);
  // What has not been said is left out of the line: "Not Specified" twice says nothing.
  const summary = [
    status?.label,
    sermon && draft.intendedFormat !== classificationDefaults.intendedFormat && format?.label,
    sermon && draft.sermonType !== classificationDefaults.sermonType && type?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((shown) => !shown)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
        <span className="text-sm font-semibold">{t.fields.classification}</span>
        {!open && (
          <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">{summary}</span>
        )}
      </button>
      <div
        id={id}
        hidden={!open}
        className={cn(
          open && "grid animate-menu gap-x-4 gap-y-5 border-t px-3.5 pt-4 pb-4",
          open && sermon && "sm:grid-cols-3",
        )}
      >
        <Choice
          label={t.fields.status}
          value={draft.status}
          options={options.statuses}
          onChange={(value) => update((current) => ({ ...current, status: value }))}
          meaning={status?.meaning ?? ""}
        />
        {sermon && (
          <>
            <Choice
              label={t.fields.intendedFormat}
              value={draft.intendedFormat}
              options={options.formats}
              onChange={(value) => update((current) => ({ ...current, intendedFormat: value }))}
              meaning={format?.meaning ?? ""}
            />
            <Choice
              label={t.fields.sermonType}
              value={draft.sermonType}
              options={options.sermonTypes}
              onChange={(value) => update((current) => ({ ...current, sermonType: value }))}
              meaning={type?.definition ?? ""}
              help={<SermonTypeGuide />}
            />
          </>
        )}
      </div>
    </div>
  );
}
