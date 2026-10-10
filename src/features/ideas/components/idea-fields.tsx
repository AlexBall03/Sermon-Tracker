"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { ScriptureField } from "@/features/scripture/components/scripture-field";
import {
  ideaLimits,
  ideaStatusLabels,
  ideaStatuses,
  sermonTypeLabels,
  sermonTypes,
  type IdeaKind,
  type SermonType,
} from "../model";
import type { IdeaDraft } from "../schemas";
import type { IdeaTag } from "../tags";
import { TagPicker } from "./tag-picker";

/** Applies a change to the draft as it stands, as a state setter does. */
export type UpdateDraft = (change: (draft: IdeaDraft) => IdeaDraft) => void;

type FieldProps = {
  /** Distinguishes the capture form's controls from the editor's on one page. */
  form: string;
  draft: IdeaDraft;
  update: UpdateDraft;
  errors?: Record<string, string>;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
      {message}
    </p>
  );
}

const kindOptions: { value: IdeaKind; label: string }[] = [
  { value: "sermon", label: "Sermon" },
  { value: "point", label: "Point" },
  { value: "undecided", label: "Undecided" },
];

/** Sermon, point, or not decided yet. Changing it loses nothing. */
export function KindField({
  form,
  value,
  onChange,
  disabled,
  hideLabel = false,
}: {
  form: string;
  value: IdeaKind;
  onChange: (kind: IdeaKind) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <Segmented
      label="Kind of idea"
      hideLabel={hideLabel}
      name={`${form}-kind`}
      options={kindOptions}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** The idea itself: the one thing that must be written. */
export function TitleField({
  form,
  draft,
  update,
  errors,
  inputRef,
  label = "Idea",
  hideLabel = false,
  placeholder,
}: FieldProps & {
  inputRef?: React.Ref<HTMLInputElement>;
  label?: string;
  hideLabel?: boolean;
  placeholder?: string;
}) {
  const id = `${form}-title`;
  return (
    <div>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <Input
        ref={inputRef}
        id={id}
        name="title"
        value={draft.title}
        onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}
        placeholder={placeholder}
        maxLength={ideaLimits.title}
        autoComplete="off"
        enterKeyHint="done"
        aria-invalid={errors?.title ? true : undefined}
        aria-describedby={errors?.title ? `${id}-error` : undefined}
        // The sermon material face, a little larger: this is the thought being kept.
        className={`h-12 font-serif text-lg font-medium md:text-lg ${hideLabel ? "" : "mt-2"}`}
      />
      <FieldError id={`${id}-error`} message={errors?.title} />
    </div>
  );
}

export function NotesField({
  form,
  draft,
  update,
  errors,
  onSubmitShortcut,
}: FieldProps & {
  /** Ctrl or Command with Enter: Enter alone is a new line here. */
  onSubmitShortcut?: () => void;
}) {
  const id = `${form}-notes`;
  return (
    <div>
      <Label htmlFor={id}>Notes</Label>
      <Textarea
        id={id}
        name="notes"
        value={draft.notes}
        onChange={(event) => update((current) => ({ ...current, notes: event.target.value }))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmitShortcut) {
            event.preventDefault();
            onSubmitShortcut();
          }
        }}
        maxLength={ideaLimits.notes}
        placeholder="Anything that belongs with it."
        aria-invalid={errors?.notes ? true : undefined}
        aria-describedby={errors?.notes ? `${id}-error` : undefined}
        className="mt-2"
      />
      <FieldError id={`${id}-error`} message={errors?.notes} />
    </div>
  );
}

/** The idea's passages. A sermon may star one as its main text. */
export function ReferencesField({ draft, update }: Pick<FieldProps, "draft" | "update">) {
  return (
    <ScriptureField
      value={draft.references}
      onChange={(change) =>
        update((current) => ({ ...current, references: change(current.references) }))
      }
      allowPrimary={draft.kind === "sermon"}
      max={ideaLimits.references}
    />
  );
}

/** The idea's tags, chosen from the account's own, with a new one made on the spot if needed. */
export function TagsField({
  draft,
  update,
  options,
}: Pick<FieldProps, "draft" | "update"> & { options: IdeaTag[] }) {
  return (
    <TagPicker
      value={draft.tags}
      onChange={(change) => update((current) => ({ ...current, tags: change(current.tags) }))}
      options={options}
    />
  );
}

export function StatusField({ form, draft, update }: FieldProps) {
  return (
    <Segmented
      label="Status"
      name={`${form}-status`}
      options={ideaStatuses.map((value) => ({ value, label: ideaStatusLabels[value] }))}
      value={draft.status}
      onChange={(status) => update((current) => ({ ...current, status }))}
    />
  );
}

const sermonTypeOptions: { value: SermonType | "none"; label: string }[] = [
  { value: "none", label: "Not set" },
  ...sermonTypes.map((value) => ({ value, label: sermonTypeLabels[value] })),
];

/** What only a sermon has. Shown for sermons; kept, unseen, for anything else. */
export function SermonFields({ form, draft, update, errors }: FieldProps) {
  const id = `${form}-subject`;
  return (
    <>
      <Segmented
        label="Sermon type"
        name={`${form}-sermon-type`}
        options={sermonTypeOptions}
        value={draft.sermonType ?? "none"}
        onChange={(value) =>
          update((current) => ({ ...current, sermonType: value === "none" ? null : value }))
        }
      />
      <div>
        <Label htmlFor={id}>Subject or theme</Label>
        <Input
          id={id}
          name="subject"
          value={draft.subject}
          onChange={(event) => update((current) => ({ ...current, subject: event.target.value }))}
          maxLength={ideaLimits.subject}
          placeholder="Grace, prayer, the cross"
          autoComplete="off"
          aria-invalid={errors?.subject ? true : undefined}
          aria-describedby={errors?.subject ? `${id}-error` : undefined}
          className="mt-2"
        />
        <FieldError id={`${id}-error`} message={errors?.subject} />
      </div>
    </>
  );
}
