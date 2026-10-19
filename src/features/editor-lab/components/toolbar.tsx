"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  CornerDownRight,
  Heading2,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Plus,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { addPoint, indent, movePoint, outdent, run, type Command } from "../outline-commands";

/** How many times the toolbar has rendered, for the lab's measurements. */
export const toolbarRenders = { count: 0 };

export function LabToolbar({ editor }: { editor: Editor }) {
  const t = useT("editorLab").toolbar;
  // Only what the buttons show; the toolbar renders again only when one of these changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const can = (command: Command) => command(current.state);
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        heading: current.isActive("heading"),
        paragraph: current.isActive("paragraph"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        undo: current.can().undo(),
        redo: current.can().redo(),
        point: can(addPoint("sibling")),
        subpoint: can(addPoint("child")),
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

  const chain = () => editor.chain().focus();
  const command = (value: Command) => () => {
    run(editor, value);
    editor.commands.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={t.label}
      className="flex flex-wrap items-center gap-1 rounded-xl border bg-surface p-1.5 shadow-card"
    >
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
      </Group>
      <Group>
        <Tool
          label={t.paragraph}
          pressed={state.paragraph}
          onPress={() => chain().setParagraph().run()}
          icon={Pilcrow}
        />
        <Tool
          label={t.heading}
          pressed={state.heading}
          onPress={() => chain().toggleHeading({ level: 2 }).run()}
          icon={Heading2}
        />
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
      </Group>
      <Group>
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
      <Group last>
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
    </div>
  );
}

function Group({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-0.5", !last && "border-r pr-1")}>{children}</div>
  );
}

function Tool({
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
