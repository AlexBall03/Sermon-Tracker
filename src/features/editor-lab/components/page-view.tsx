"use client";

import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, FileText, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import {
  defaultMargins,
  fitMargins,
  isPaperSize,
  papers,
  paperSizes,
  type Margins,
  type PageSetup,
  type PaperSize,
} from "../pagination/geometry";
import { layoutModes, printLayoutOf, type LayoutMode } from "../pagination/plugin";
import {
  layoutPreferences,
  readDefaultLayout,
  writeDefaultLayout,
  writePageSetup,
  writeTabLayout,
  type LayoutPreference,
} from "../pagination/preferences";
import { Tool } from "./toolbar";

/*
 * The page view (PS-1B.2B.1): Regular or Print Layout, the paper, the
 * margins, and the passages' expansion. All of it is view state: each is
 * changed by a command that carries only a meta and stays out of history,
 * and none of it is ever a document change (handoff PS-1B.1 §J).
 */

export type PageViewState = { layout: LayoutMode; setup: PageSetup };

/** The nearest ancestor that scrolls the writing area (the desk, or the window). */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return document.scrollingElement as HTMLElement;
}

/**
 * Runs a change of layout and keeps the place in view: the caret when the
 * editor has focus, else the block at the top of the writing area, stays
 * where it was on screen. Without this, a short outline switched to Print
 * Layout could leave the old scroll position over blank paper.
 */
function keepingPlace(editor: Editor, change: () => void) {
  const { view } = editor;
  const scroller = scrollerOf(view.dom);
  const top = () => scroller.getBoundingClientRect().top;
  const head = view.state.selection.head;
  const block = editor.isFocused
    ? null
    : (Array.from(view.dom.children).find(
        (child) =>
          child instanceof HTMLElement &&
          !child.classList.contains("lab-pages") &&
          child.getBoundingClientRect().bottom > top(),
      ) as HTMLElement | undefined);
  const where = () =>
    block ? block.getBoundingClientRect().top - top() : view.coordsAtPos(head).top - top();
  let before: number;
  try {
    before = where();
  } catch {
    change();
    return;
  }
  change();
  // After the new layout is drawn and the pages are measured.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (view.isDestroyed) return;
      try {
        scroller.scrollTop += where() - before;
      } catch {
        // The place is gone (nothing to keep): the scroll stays as it is.
      }
    }),
  );
}

/** The view of one editor: what its controls show, and the changes they make. */
export function usePageView() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [view, setView] = useState<PageViewState | null>(null);
  const [expanded, setExpanded] = useState(false);

  /** Reads the editor's starting view, once it exists (its `onCreate`). */
  const attach = useCallback((created: Editor) => {
    setEditor(created);
    const current = printLayoutOf(created.state);
    if (current) setView({ layout: current.layout, setup: current.setup });
  }, []);

  /**
   * Regular or Print Layout, keeping the place in view. `remember`: this
   * tab's choice (§C.9); a layout the workspace sets by itself (a window
   * that became a desktop) is not a choice and is not remembered.
   */
  const switchLayout = (layout: LayoutMode, remember = true) => {
    if (!editor || printLayoutOf(editor.state)?.layout === layout) return;
    keepingPlace(editor, () => editor.commands.setLayout(layout));
    // The default is never written from here.
    if (remember) writeTabLayout(layout);
    setView((current) => (current ? { ...current, layout } : current));
  };

  /** Paper and margins: applied to the pages at once, remembered for the next document when settled. */
  const applySetup = (setup: PageSetup, remember: boolean) => {
    if (!editor) return;
    editor.commands.setPageSetup(setup);
    if (remember) writePageSetup(setup);
    setView((current) => (current ? { ...current, setup } : current));
  };
  const setMargins = (margins: Margins, remember: boolean) => {
    if (view) applySetup({ size: view.setup.size, margins }, remember);
  };
  const setPaper = (size: PaperSize) => {
    if (view) applySetup({ size, margins: fitMargins(size, view.setup.margins) }, true);
  };

  const toggleExpanded = () => {
    if (!editor) return;
    editor.commands.setPassagesExpanded(!expanded);
    setExpanded(!expanded);
  };

  return {
    view,
    print: view?.layout === "print",
    expanded,
    attach,
    switchLayout,
    setMargins,
    setPaper,
    toggleExpanded,
    /** A new document opens with its passages as the layout draws them. */
    resetExpansion: () => setExpanded(false),
  };
}

export type PageView = ReturnType<typeof usePageView>;

/**
 * The layout, the paper, the passages' expansion, and resetting the margins:
 * the toolbar's view controls. With `pageSetup="menu"` the paper and the
 * margins are one labelled "Page setup" menu instead of a list and a bare
 * icon (whose arrow reads as "refresh").
 */
export function ViewControls({
  page,
  pageSetup = "inline",
  layoutSwitch = true,
}: {
  page: PageView;
  pageSetup?: "inline" | "menu";
  /** Whether Regular and Print can be chosen here (the sermon editor's desktop is Print only, A1-UI.1). */
  layoutSwitch?: boolean;
}) {
  const t = useT("editorLab");
  const { view } = page;
  if (!view) return null;
  return (
    <>
      {layoutSwitch && (
        <Segmented
          label={t.print.layout}
          hideLabel
          name="lab-layout"
          value={view.layout}
          onChange={(layout) => page.switchLayout(layout)}
          options={layoutModes.map((mode) => ({ value: mode, label: t.print.layouts[mode] }))}
        />
      )}
      {pageSetup === "menu" && <PageSetupMenu page={page} />}
      {/* Always shown: the paper is what the sermon prints on, in either layout. */}
      {pageSetup === "inline" && (
        <Select
          label={t.print.paper}
          value={view.setup.size}
          onChange={(value) => {
            if (isPaperSize(value)) page.setPaper(value);
          }}
          options={paperSizes.map((size) => ({ value: size, label: t.print.papers[size] }))}
          className="w-40"
        />
      )}
      {/*
        Expansion is Regular Layout's: in Print Layout a passage shows as it
        prints, so the button rests there, saying why. Its icon shows what a
        press does; it is not coloured as "on". Where Print Layout is the
        only layout, the button would never act, so it is not shown.
      */}
      {layoutSwitch && (
        <Tool
          label={
            page.print
              ? t.print.expandInPrint
              : page.expanded
                ? t.print.collapsePassages
                : t.print.expandPassages
          }
          disabled={page.print}
          icon={page.expanded ? ChevronsDownUp : ChevronsUpDown}
          onPress={page.toggleExpanded}
        />
      )}
      {pageSetup === "inline" && (
        <Tool
          label={t.print.resetMargins}
          icon={RotateCcw}
          onPress={() => page.setMargins(defaultMargins(view.setup.size), true)}
        />
      )}
    </>
  );
}

/** The paper and the margins, in one menu that says what it is. */
function PageSetupMenu({ page }: { page: PageView }) {
  const t = useT("editorLab");
  const { view } = page;
  if (!view) return null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-2.5">
            <FileText aria-hidden />
            {t.print.pageSetup}
            <ChevronDown aria-hidden className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <Select
          label={t.print.paper}
          value={view.setup.size}
          onChange={(value) => {
            if (isPaperSize(value)) page.setPaper(value);
          }}
          options={paperSizes.map((size) => ({ value: size, label: t.print.papers[size] }))}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{t.print.marginsHint}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => page.setMargins(defaultMargins(view.setup.size), true)}
        >
          {t.print.resetMargins}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The size of the printed pages (@page), for the paper chosen, while in Print Layout. */
export function PrintPageStyle({ page }: { page: PageView }) {
  if (!page.print || !page.view) return null;
  return (
    <style>{`@media print { @page { size: ${papers[page.view.setup.size].css}; margin: 0; } }`}</style>
  );
}

/**
 * The default layout for this device (a browser preference). Drawn only in
 * the browser (inside the workspace's frame), so it reads the preference as it first renders.
 */
export function DefaultLayoutSelect({ className }: { className?: string }) {
  const t = useT("editorLab");
  const [preference, setPreference] = useState<LayoutPreference>(() => readDefaultLayout());
  return (
    <Select
      label={t.print.defaultLayout}
      value={preference}
      onChange={(value) => {
        const next = value as LayoutPreference;
        writeDefaultLayout(next);
        setPreference(next);
      }}
      options={layoutPreferences.map((value) => ({
        value,
        label: t.print.defaults[value],
      }))}
      className={className}
    />
  );
}
