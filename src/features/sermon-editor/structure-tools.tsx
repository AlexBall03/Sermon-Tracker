"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowLeftToLine,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleSlash,
  Copy,
  ExternalLink,
  CornerDownRight,
  Ellipsis,
  ListIndentDecrease,
  ListIndentIncrease,
  ListTree,
  PanelBottom,
  Palette,
  PanelTop,
  Plus,
  Trash,
} from "lucide-react";
import { NodeSelection } from "@tiptap/pm/state";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKeptSelection } from "@/features/editor-lab/components/formatting/keep-selection";
import { Group, Tool } from "@/features/editor-lab/components/toolbar";
import type { Command } from "@/features/editor-lab/outline-commands";
import {
  addPoint,
  decreaseLevel,
  deletePointGroup,
  duplicatePointGroup,
  increaseLevel,
  moveGroup,
  moveOut,
  pointToProse,
  proseToPoint,
  setRole,
} from "@/features/editor-lab/v4/commands";
import { foldTargetAtCaret } from "@/features/editor-lab/v4/folding";
import { referenceFrom } from "@/features/editor-lab/schema/scripture";
import type { ScriptureReference } from "@/features/scripture/reference";
import { useT } from "@/i18n/client";
import { componentAtSelection } from "./appearance/target";

/*
 * The structure of the sermon, on demand (schema v4). Every control is one
 * v4 command, available only where it applies.
 *
 * The labels say what each one affects. "Point" (turn into a point, or back
 * into writing) and the roles change only the point itself; everything else
 * acts on the point with all it owns (its group). The common ones are on the
 * row (turn into a point, new point, new subpoint, a level in, move out:
 * the keys Tab and Shift+Tab also do); moving, duplicating, the roles, and
 * deleting are in "More", under headings that say what each affects.
 */
export function StructureTools({
  editor,
  onAppearance,
  bibleHref,
}: {
  editor: Editor;
  /** Opens Appearance on the selected component (A1-UI.2B.2). */
  onAppearance?: () => void;
  /** The reader's address for a selected passage (A3.1); without it, no "Open in the Bible" here. */
  bibleHref?: (reference: ScriptureReference) => string;
}) {
  const t = useT("editorLab");
  const view = useT("sermonEditor").view;
  const bible = useT("scripture").field;
  const a = t.v4.actions;
  const keeper = useKeptSelection(editor);
  const can = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const check = (command: Command) => command(e.state);
      return {
        inPoint: e.state.selection.$from.parent.type.name === "point",
        toPoint: check(proseToPoint),
        toProse: check(pointToProse),
        point: check(addPoint("sibling")),
        subpoint: check(addPoint("child")),
        increase: check(increaseLevel),
        moveOut: check(moveOut),
        moveUp: check(moveGroup("up")),
        moveDown: check(moveGroup("down")),
        duplicate: check(duplicatePointGroup),
        decrease: check(decreaseLevel),
        deleteGroup: check(deletePointGroup),
        introduction: check(setRole("introduction")),
        conclusion: check(setRole("conclusion")),
        clearRole: check(setRole(null)),
        component: componentAtSelection(e.state) !== null,
        fold: foldTargetAtCaret(e.state),
        passage: selectedPassage(e.state.selection),
      };
    },
  });
  const command = (value: Command) => () => {
    value(editor.state, (tr) => editor.view.dispatch(tr));
    editor.commands.focus();
  };
  const toggle = can.inPoint ? pointToProse : proseToPoint;
  const toggleable = can.inPoint ? can.toProse : can.toPoint;
  const item = (label: string, icon: typeof Plus, enabled: boolean, value: Command) => {
    const Icon = icon;
    return (
      <DropdownMenuItem
        disabled={!enabled}
        variant={value === deletePointGroup ? "destructive" : "default"}
        onClick={() => keeper.apply(value)}
      >
        <Icon aria-hidden />
        {label}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <Group>
        <Tool
          label={can.inPoint ? a.toProse : a.toPoint}
          icon={ListTree}
          pressed={can.inPoint}
          disabled={!toggleable}
          onPress={command(toggle)}
        />
        <Tool
          label={a.point}
          icon={Plus}
          disabled={!can.point}
          onPress={command(addPoint("sibling"))}
        />
        <Tool
          label={a.subpoint}
          icon={CornerDownRight}
          disabled={!can.subpoint}
          onPress={command(addPoint("child"))}
        />
        <Tool
          label={a.increase}
          icon={ListIndentIncrease}
          disabled={!can.increase}
          onPress={command(increaseLevel)}
        />
        <Tool
          label={a.moveOut}
          icon={ArrowLeftToLine}
          disabled={!can.moveOut}
          onPress={command(moveOut)}
        />
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) keeper.remember();
          }}
        >
          <DropdownMenuTrigger
            aria-label={t.v4.more}
            title={t.v4.more}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72" finalFocus={keeper.finalFocus}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t.v4.withContent}</DropdownMenuLabel>
              {item(a.moveUp, ArrowUp, can.moveUp, moveGroup("up"))}
              {item(a.moveDown, ArrowDown, can.moveDown, moveGroup("down"))}
              {item(a.duplicate, Copy, can.duplicate, duplicatePointGroup)}
              {item(a.decrease, ListIndentDecrease, can.decrease, decreaseLevel)}
              {item(a.deleteGroup, Trash, can.deleteGroup, deletePointGroup)}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t.v4.thisPoint}</DropdownMenuLabel>
              {item(a.introduction, PanelTop, can.introduction, setRole("introduction"))}
              {item(a.conclusion, PanelBottom, can.conclusion, setRole("conclusion"))}
              {item(a.clearRole, CircleSlash, can.clearRole, setRole(null))}
              {onAppearance && (
                <DropdownMenuItem disabled={!can.component} onClick={onAppearance}>
                  <Palette aria-hidden />
                  {t.appearance.structureAction}
                </DropdownMenuItem>
              )}
              {/* View state, never an edit (A3.1): the point the caret is in or under, with all it owns. */}
              <DropdownMenuItem
                data-testid="structure-fold"
                disabled={!can.fold}
                onClick={() => {
                  if (!can.fold) return;
                  editor.chain().focus().setPointFolded(can.fold.id, !can.fold.folded).run();
                }}
              >
                {can.fold?.folded ? <ChevronsUpDown aria-hidden /> : <ChevronsDownUp aria-hidden />}
                {can.fold?.folded ? view.expandPoint : view.collapsePoint}
              </DropdownMenuItem>
              {/* A link, so the leave guard sees it as it sees every link (A3.1). */}
              {bibleHref && can.passage && (
                <DropdownMenuItem
                  data-testid="structure-open-bible"
                  render={<Link href={bibleHref(can.passage)} />}
                >
                  <ExternalLink aria-hidden />
                  {bible.openInTheBible}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Group>
    </>
  );
}

/** The passage the selection is, when it is one passage block. */
function selectedPassage(selection: { constructor: unknown }): ScriptureReference | null {
  if (!(selection instanceof NodeSelection)) return null;
  if (selection.node.type.name !== "scripturePassage") return null;
  return referenceFrom(selection.node.attrs);
}
