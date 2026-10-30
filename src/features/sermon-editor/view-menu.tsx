"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { BookOpen, ChevronDown, ChevronsDownUp, ChevronsUpDown, Eye } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { expansionOf } from "@/features/editor-lab/pagination/expansion";
import { printLayoutOf } from "@/features/editor-lab/pagination/plugin";
import { foldingOf } from "@/features/editor-lab/v4/folding";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/*
 * The View menu (A3.1): what is shown of the outline, never what it says.
 * Points and Scripture are separate controls (owner's decision): folding
 * points never expands or collapses a passage, and the reverse.
 *
 * Folding works in every layout (Print Layout too, owner's decision); the
 * printed sermon is always complete (`printing.ts`). Scripture follows the
 * layout in use: in Regular Layout it expands or collapses the passages'
 * text; in Print Layout a passage shows as its `print` setting says, and
 * "Collapse all Scripture" only hides the text on screen until it is
 * expanded again. Each item rests when it would do nothing.
 */
export function ViewMenu({ editor }: { editor: Editor }) {
  const t = useT("sermonEditor").view;
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const folding = foldingOf(e.state);
      const passages = expansionOf(e.state);
      const print = printLayoutOf(e.state)?.layout === "print";
      return {
        expandPoints: folding.folded > 0,
        collapsePoints: folding.foldable > folding.folded,
        expandScripture: print ? passages.collapsed > 0 : passages.passages > passages.expanded,
        collapseScripture: print ? passages.passages > passages.collapsed : passages.expanded > 0,
        print,
      };
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="view-menu"
        aria-label={t.menu}
        title={t.menu}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1 px-2.5 pointer-coarse:h-11",
        )}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Eye aria-hidden />
        <span className="max-sm:sr-only">{t.label}</span>
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuItem
            data-testid="view-expand-points"
            disabled={!state.expandPoints}
            onClick={() => editor.commands.setAllPointsFolded(false)}
          >
            <ChevronsUpDown aria-hidden />
            {t.expandPoints}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="view-collapse-points"
            disabled={!state.collapsePoints}
            onClick={() => editor.commands.setAllPointsFolded(true)}
          >
            <ChevronsDownUp aria-hidden />
            {t.collapsePoints}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            data-testid="view-expand-scripture"
            disabled={!state.expandScripture}
            onClick={() =>
              state.print
                ? editor.commands.setPassagesCollapsedInPrint(false)
                : editor.commands.setPassagesExpanded(true)
            }
          >
            <BookOpen aria-hidden />
            {t.expandScripture}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="view-collapse-scripture"
            disabled={!state.collapseScripture}
            onClick={() =>
              state.print
                ? editor.commands.setPassagesCollapsedInPrint(true)
                : editor.commands.setPassagesExpanded(false)
            }
          >
            <ChevronsDownUp aria-hidden />
            {t.collapseScripture}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
