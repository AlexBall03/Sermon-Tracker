"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  Baseline,
  Bold,
  Copy,
  CornerDownRight,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Plus,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { clearFormatting, setHighlight, setTextColor } from "../formatting-commands";
import { blockState, textState } from "../formatting-state";
import {
  addPoint,
  duplicatePoint,
  indent,
  movePoint,
  outdent,
  run,
  type Command,
} from "../outline-commands";
import { ColorControl } from "./formatting/color-control";
import { useKeptSelection } from "./formatting/keep-selection";
import { AlignButtons, SpacingControl } from "./formatting/paragraph-controls";
import { FontSelect, SizeField, StyleSelect } from "./formatting/text-controls";

/** How many times the toolbar has rendered, for the lab's measurements. */
export const toolbarRenders = { count: 0 };

/**
 * The editor's one toolbar row, in the order word processors use: history;
 * paragraph style, font, and size; bold, italic, underline, and colors;
 * alignment and spacing; clearing; lists; then the outline's own actions.
 * `children` are the view's controls (layout, paper), kept at the row's end.
 *
 * Every control calls the shared commands (`formatting-commands.ts`,
 * `outline-commands.ts`). Each group follows only the values it shows
 * (`useEditorState`), so typing re-renders a group only when what it shows
 * changes.
 */
export function LabToolbar({ editor, children }: { editor: Editor; children?: React.ReactNode }) {
  const t = useT("editorLab").toolbar;
  // Only what the buttons show; the toolbar renders again only when one of these changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const can = (command: Command) => command(current.state);
      return {
        point: can(addPoint("sibling")),
        subpoint: can(addPoint("child")),
        duplicate: can(duplicatePoint),
        up: can(movePoint("up")),
        down: can(movePoint("down")),
        indent: can(indent),
        outdent: can(outdent),
      };
    },
  });
  useEffect(() => {
    toolbarRenders.count += 1;
  });

  const command = (value: Command) => () => {
    run(editor, value);
    editor.commands.focus();
  };

  return (
    <ToolbarRow label={t.label} end={children}>
      <HistoryGroup editor={editor} />
      <StyleGroup editor={editor} />
      <InlineGroup editor={editor} />
      <ParagraphGroup editor={editor} />
      <ListGroup editor={editor} />
      <Group last>
        <Tool
          label={t.addPoint}
          disabled={!state.point}
          onPress={command(addPoint("sibling"))}
          icon={Plus}
        />
        <Tool
          label={t.addSubpoint}
          disabled={!state.subpoint}
          onPress={command(addPoint("child"))}
          icon={CornerDownRight}
        />
        <Tool
          label={t.duplicate}
          disabled={!state.duplicate}
          onPress={command(duplicatePoint)}
          icon={Copy}
        />
        <Tool
          label={t.moveUp}
          disabled={!state.up}
          onPress={command(movePoint("up"))}
          icon={ArrowUp}
        />
        <Tool
          label={t.moveDown}
          disabled={!state.down}
          onPress={command(movePoint("down"))}
          icon={ArrowDown}
        />
        <Tool
          label={t.outdent}
          disabled={!state.outdent}
          onPress={command(outdent)}
          icon={IndentDecrease}
        />
        <Tool
          label={t.indent}
          disabled={!state.indent}
          onPress={command(indent)}
          icon={IndentIncrease}
        />
      </Group>
    </ToolbarRow>
  );
}

/**
 * The toolbar's row. One row: on a phone it scrolls sideways instead of
 * stacking; wider, it wraps if it must. `end` (the view's controls) is kept
 * at the row's end.
 */
export function ToolbarRow({
  label,
  end,
  children,
}: {
  label: string;
  end?: React.ReactNode;
  children: React.ReactNode;
}) {
  // `relative`: a control's visually hidden input (a radio's `sr-only`, absolutely positioned) stays
  // inside this row's own sideways scroll. Without it, focusing one off screen on a phone scrolled the
  // whole workspace sideways and left it blank (A1-UI.1).
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="relative flex items-center gap-1 overflow-x-auto px-2 py-1.5 md:flex-wrap md:overflow-visible"
    >
      {children}
      {end && <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">{end}</div>}
    </div>
  );
}

/** Undo and redo. */
export function HistoryGroup({ editor }: { editor: Editor }) {
  const t = useT("editorLab").toolbar;
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <Group>
      <Tool
        label={t.undo}
        disabled={!state.undo}
        onPress={() => chain().undo().run()}
        icon={Undo2}
      />
      <Tool
        label={t.redo}
        disabled={!state.redo}
        onPress={() => chain().redo().run()}
        icon={Redo2}
      />
    </Group>
  );
}

/** The two kinds of list; `children` are further block toggles of the same kind (a quotation). */
export function ListGroup({ editor, children }: { editor: Editor; children?: React.ReactNode }) {
  const t = useT("editorLab").toolbar;
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <Group>
      <Tool
        label={t.bulletList}
        pressed={state.bulletList}
        onPress={() => chain().toggleBulletList().run()}
        icon={List}
      />
      <Tool
        label={t.orderedList}
        pressed={state.orderedList}
        onPress={() => chain().toggleOrderedList().run()}
        icon={ListOrdered}
      />
      {children}
    </Group>
  );
}

/** Paragraph style, font, and size; `children` go right after them (a control for the styles themselves). */
export function StyleGroup({ editor, children }: { editor: Editor; children?: React.ReactNode }) {
  const keeper = useKeptSelection(editor);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const text = textState(current.state);
      const block = blockState(current.state);
      return { text, block };
    },
  });
  return (
    <Group>
      <div className="flex items-center gap-1">
        <StyleSelect state={state.block} keeper={keeper} />
        <FontSelect state={state.text} keeper={keeper} />
        <SizeField state={state.text} keeper={keeper} />
        {children}
      </div>
    </Group>
  );
}

/** Bold, italic, underline, and the two colors. */
export function InlineGroup({ editor }: { editor: Editor }) {
  const t = useT("editorLab").toolbar;
  const keeper = useKeptSelection(editor);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const text = textState(current.state);
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        color: text.color,
        highlight: text.highlight,
      };
    },
  });
  const chain = () => editor.chain().focus();
  return (
    <Group>
      <Tool
        label={t.bold}
        pressed={state.bold}
        onPress={() => chain().toggleBold().run()}
        icon={Bold}
      />
      <Tool
        label={t.italic}
        pressed={state.italic}
        onPress={() => chain().toggleItalic().run()}
        icon={Italic}
      />
      <Tool
        label={t.underline}
        pressed={state.underline}
        onPress={() => chain().toggleUnderline().run()}
        icon={Underline}
      />
      <ColorControl
        kind="ink"
        icon={Baseline}
        value={state.color}
        onOpen={keeper.remember}
        onPick={(value) => keeper.apply(setTextColor(value))}
        finalFocus={keeper.finalFocus}
      />
      <ColorControl
        kind="fill"
        icon={Highlighter}
        value={state.highlight}
        onOpen={keeper.remember}
        onPick={(value) => keeper.apply(setHighlight(value))}
        finalFocus={keeper.finalFocus}
      />
    </Group>
  );
}

/** Alignment, spacing, and clearing direct formatting. */
export function ParagraphGroup({ editor }: { editor: Editor }) {
  const t = useT("editorLab").format;
  const keeper = useKeptSelection(editor);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => blockState(current.state),
  });
  return (
    <Group>
      <AlignButtons state={state} keeper={keeper} />
      <SpacingControl state={state} keeper={keeper} />
      <Tool
        label={t.clear}
        icon={RemoveFormatting}
        disabled={!state.clearable}
        onPress={() => keeper.apply(clearFormatting)}
      />
    </Group>
  );
}

export function Group({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-0.5", !last && "border-r pr-1")}>{children}</div>
  );
}

export function Tool({
  label,
  icon: Icon,
  onPress,
  pressed,
  disabled,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onPress: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keep the editor's selection: the button never takes focus from it on a press.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cn(pressed && "bg-primary-soft text-primary")}
    >
      <Icon aria-hidden />
    </Button>
  );
}
