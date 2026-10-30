import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import {
  breakFill,
  defaultSetup,
  deskGap,
  pageMetrics,
  pagesFor,
  type PageMetrics,
  type PageSetup,
} from "./geometry";
import { printingKey } from "./printing";

/*
 * Print Layout (PS-1B.2B.1, a feasibility prototype in the lab). The same
 * editor, the same document: switching layout, paper, or margins is a
 * transaction that carries only a meta and is kept out of history, and
 * paginating changes nothing in the document and dispatches nothing.
 *
 * How the pages are made. In Print Layout the editor is one sheet wide and
 * its text column is the paper's text area. One widget at the start of the
 * document holds a column of floats: for each page, a spacer with no width
 * and the height of the text area, then a full-width "gap" the height of the
 * bottom margin, the desk, and the next top margin, all stacked by
 * `clear: both`. A line
 * of text cannot sit beside a float as wide as the column, so the browser
 * moves every line that would cross a gap below it: a paragraph continues
 * on the next page, line by line, with nothing inserted in it and nothing
 * split in the document. The technique is the one `tiptap-pagination-plus`
 * (MIT) uses; it is reimplemented here, measured without transactions.
 *
 * What is measured, after a change and before it is painted (or in the next
 * frame, after a resize or a font or passage loading): the top of each explicit page
 * break (it is given the height that reaches the next page), and the bottom
 * of the last block (the number of gaps is fitted to it). Both are written
 * into DOM ProseMirror ignores: the widget's own children, and a leaf node's
 * style. The geometry is in `geometry.ts`.
 */

export const layoutModes = ["regular", "print"] as const;
export type LayoutMode = (typeof layoutModes)[number];

export type PrintLayoutState = { layout: LayoutMode; setup: PageSetup };

export const printLayoutKey = new PluginKey<PrintLayoutState>("labPrintLayout");

/** Counts for the lab's measurements and tests. Nothing is sent. */
export const paginationStats = {
  /** Measurements made. */
  runs: 0,
  /** Layout passes within the last measurement. */
  passes: 0,
  lastMs: 0,
  slowestMs: 0,
  pages: 0,
  /** Measurements that wrote anything (a break's fill, the number of gaps). */
  writes: 0,
  reset() {
    this.runs = this.passes = this.lastMs = this.slowestMs = this.pages = this.writes = 0;
  },
};

export type PrintLayoutOptions = {
  /** The layout and page setup a new editor starts in. Called once, in the browser. */
  initial: () => PrintLayoutState;
  /** Told after a measurement that changed the pages, with how many there are. */
  onPages?: (pages: number) => void;
};

type PrintLayoutStorage = { current: PrintLayoutState | null };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    printLayout: {
      /** Regular or Print Layout. View state: no document change, no history. */
      setLayout: (layout: LayoutMode) => ReturnType;
      /** Paper and margins. In this prototype also view state (see the handoff). */
      setPageSetup: (setup: PageSetup) => ReturnType;
    };
  }
}

const cssVariables = (setup: PageSetup) => {
  const metrics = pageMetrics(setup);
  const { margins } = setup;
  return [
    `--page-w:${metrics.width}px`,
    `--page-h:${metrics.height}px`,
    `--content-h:${metrics.contentHeight}px`,
    `--mt:${margins.top}px`,
    `--mr:${margins.right}px`,
    `--mb:${margins.bottom}px`,
    `--ml:${margins.left}px`,
    `--desk:${deskGap}px`,
  ].join(";");
};

export const PrintLayout = Extension.create<PrintLayoutOptions, PrintLayoutStorage>({
  name: "printLayout",

  addOptions() {
    return { initial: () => ({ layout: "regular", setup: defaultSetup() }) };
  },

  addStorage() {
    return { current: null };
  },

  addCommands() {
    return {
      setLayout:
        (layout) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(printLayoutKey, { layout }).setMeta("addToHistory", false);
          return true;
        },
      setPageSetup:
        (setup) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(printLayoutKey, { setup }).setMeta("addToHistory", false);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const options = this.options;
    return [
      new Plugin<PrintLayoutState>({
        key: printLayoutKey,
        state: {
          // A document loaded into the editor later keeps the layout in force.
          init: () => (storage.current ??= options.initial()),
          apply(tr, previous) {
            const change = tr.getMeta(printLayoutKey) as Partial<PrintLayoutState> | undefined;
            if (!change) return previous;
            const next = { ...previous, ...change };
            storage.current = next;
            return next;
          },
        },
        props: {
          attributes: (state) => {
            const current = printLayoutKey.getState(state)!;
            return { "data-layout": current.layout, style: cssVariables(current.setup) };
          },
          decorations: (state) =>
            printLayoutKey.getState(state)!.layout === "print"
              ? DecorationSet.create(state.doc, [
                  Decoration.widget(0, (view) => paginatorFor(view, options).root, {
                    side: -1,
                    key: "lab-pages",
                    ignoreSelection: true,
                  }),
                ])
              : null,
        },
        view: (view) => paginatorFor(view, options),
      }),
      new Plugin<DecorationSet>({
        key: lineMarkKey,
        state: {
          init: (_, state) => lineMarks(state.doc, 0, state.doc.content.size, DecorationSet.empty),
          apply: (tr, previous) => (tr.docChanged ? remark(tr, previous) : previous),
        },
        props: {
          decorations: (state) =>
            printLayoutKey.getState(state)?.layout === "print" ? lineMarkKey.getState(state) : null,
        },
      }),
    ];
  },
});

/*
 * A line with nothing on it has no width, and a browser lays such a line
 * beside a page gap instead of below it. An empty paragraph is given width in
 * CSS (`lab.css`); the empty last line after a line break (Shift+Enter at
 * the end of a paragraph) cannot be styled, so in Print Layout it gets a
 * mark one pixel wide, drawn as a decoration before the end of its block. It
 * is never part of the document. Only blocks a change touched are looked at
 * again, so typing does not walk the document.
 */
const lineMarkKey = new PluginKey<DecorationSet>("labLineMarks");

const lineMark = () => {
  const mark = document.createElement("span");
  mark.className = "lab-line-mark";
  return mark;
};

function lineMarks(doc: ProseMirrorNode, from: number, to: number, set: DecorationSet) {
  const added: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.lastChild?.type.name === "hardBreak") {
      added.push(
        Decoration.widget(pos + node.nodeSize - 1, lineMark, {
          side: -1,
          key: "lab-line-mark",
          ignoreSelection: true,
        }),
      );
    }
    return false;
  });
  return set.add(doc, added);
}

/**
 * The whole top-level blocks a change touched, in the new document, from the
 * start of the first to the end of the last; null when it touched none (a
 * change of the document's attributes only). Shared by the decorations that
 * look again only where a change was (`styles/plugin.ts` too).
 */
export function touchedBlocks(tr: Transaction): { start: number; end: number } | null {
  let from = Number.POSITIVE_INFINITY;
  let to = -1;
  tr.steps.forEach((step, index) => {
    const after = tr.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, start, end) => {
      from = Math.min(from, after.map(start, -1));
      to = Math.max(to, after.map(end, 1));
    });
  });
  if (to < 0) return null;
  const size = tr.doc.content.size;
  const $from = tr.doc.resolve(Math.max(0, Math.min(from, size)));
  const $to = tr.doc.resolve(Math.max(0, Math.min(to, size)));
  return {
    start: $from.depth > 0 ? $from.before(1) : 0,
    end: $to.depth > 0 ? $to.after(1) : size,
  };
}

/** Maps the marks through a change and looks again at the blocks it touched. */
function remark(tr: Transaction, previous: DecorationSet) {
  let set = previous.map(tr.mapping, tr.doc);
  const touched = touchedBlocks(tr);
  if (!touched) return set;
  set = set.remove(set.find(touched.start, touched.end));
  return lineMarks(tr.doc, touched.start, touched.end, set);
}

const paginators = new WeakMap<EditorView, Paginator>();

/**
 * One paginator, and so one widget element, per editor view for its whole
 * life. Loading a document makes ProseMirror replace its plugin views, but
 * it keeps the widget's element (its key is unchanged), so the new plugin
 * view must go on managing that same element.
 */
function paginatorFor(view: EditorView, options: PrintLayoutOptions) {
  let paginator = paginators.get(view);
  if (!paginator) {
    paginator = new Paginator(view, options);
    paginators.set(view, paginator);
  }
  paginator.attach();
  return paginator;
}

/** Breaks within this distance of where they should be are left alone. */
const tolerance = 0.5;
const maxPasses = 10;

class Paginator {
  readonly root: HTMLElement;
  private gaps: HTMLElement[] = [];
  private readonly end: HTMLElement;
  private frame = 0;
  private queued = false;
  private observer: ResizeObserver | null = null;
  private attached = false;

  constructor(
    private view: EditorView,
    private options: PrintLayoutOptions,
  ) {
    const doc = view.dom.ownerDocument;
    this.root = doc.createElement("div");
    this.root.className = "lab-pages";
    this.root.contentEditable = "false";
    this.root.setAttribute("aria-hidden", "true");
    this.end = this.sheetEdge("lab-page-end", 1);
    this.root.append(this.spacer(), this.end);
    doc.fonts?.ready.then(() => this.schedule()).catch(() => undefined);
    // A document font arrives when text first uses it (`fonts.ts`): its lines change, so measure again.
    doc.fonts?.addEventListener?.("loadingdone", this.onFonts);
    doc.defaultView?.addEventListener("beforeprint", this.onBeforePrint);
    doc.defaultView?.addEventListener("afterprint", this.onAfterPrint);
  }

  private readonly onFonts = () => this.schedule();

  /**
   * Before the browser prints (A3.1): the view state that hides content on
   * screen is set aside (`printing.ts`), and the pages are measured again here,
   * synchronously, while the screen's media and layout are still in force, so
   * the print has the complete document on correctly fitted pages. Never a
   * document change. In an editor without that state there is nothing to set aside.
   */
  private readonly onBeforePrint = () => {
    if (!this.attached || this.view.isDestroyed) return;
    if (printingKey.getState(this.view.state)) {
      this.view.dispatch(
        this.view.state.tr.setMeta(printingKey, true).setMeta("addToHistory", false),
      );
    }
    this.measure();
  };

  /** After printing: the screen's view state is drawn again, and the pages follow it. */
  private readonly onAfterPrint = () => {
    if (!this.attached || this.view.isDestroyed) return;
    if (printingKey.getState(this.view.state)?.printing) {
      this.view.dispatch(
        this.view.state.tr.setMeta(printingKey, false).setMeta("addToHistory", false),
      );
    }
  };

  /** Starts following the editor's size (again, after a document was loaded). */
  attach() {
    if (this.attached) return;
    this.attached = true;
    if (typeof ResizeObserver !== "undefined") {
      this.observer ??= new ResizeObserver(() => this.schedule());
      this.observer.observe(this.view.dom);
    }
    this.schedule();
  }

  update(view: EditorView, previous: EditorState) {
    this.view = view;
    const now = printLayoutKey.getState(view.state);
    if (
      view.state.doc !== previous.doc ||
      now !== printLayoutKey.getState(previous) ||
      // View state that changes what is drawn (folding, collapsed Scripture, printing; A3.1).
      printingKey.getState(view.state) !== printingKey.getState(previous)
    ) {
      this.beforePaint();
    }
  }

  /**
   * Measures after this change and before the browser paints it, so a line
   * that runs past a page is never seen in the margin first. ProseMirror has
   * already updated the DOM when it calls `update`; a microtask lets every
   * change of one task be measured once.
   */
  private beforePaint() {
    if (this.queued || !this.attached) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.attached) this.measure();
    });
  }

  destroy() {
    this.attached = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    // The paginator lives as long as its view, which ProseMirror never reattaches once destroyed.
    if (!this.view.dom.isConnected) {
      const doc = this.view.dom.ownerDocument;
      doc.fonts?.removeEventListener?.("loadingdone", this.onFonts);
      doc.defaultView?.removeEventListener("beforeprint", this.onBeforePrint);
      doc.defaultView?.removeEventListener("afterprint", this.onAfterPrint);
    }
  }

  /** Measures once in the next frame, however many changes came before it. */
  schedule() {
    if (this.frame || !this.attached || typeof requestAnimationFrame === "undefined") return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  /**
   * A float with no width and the height of a page's text area. Lines flow
   * beside it freely; it only holds the next edge one text area lower. (A
   * margin cannot do this: lines avoid a float's whole margin box.)
   */
  private spacer() {
    const spacer = this.view.dom.ownerDocument.createElement("div");
    spacer.className = "lab-page-spacer";
    return spacer;
  }

  private sheetEdge(className: string, page: number) {
    const edge = this.view.dom.ownerDocument.createElement("div");
    edge.className = className;
    const number = this.view.dom.ownerDocument.createElement("span");
    number.className = "lab-page-number";
    number.textContent = String(page);
    edge.append(number);
    return edge;
  }

  /** Keeps exactly `count` gaps, numbering the pages they end and the last one. */
  private setGaps(count: number) {
    while (this.gaps.length < count) {
      const gap = this.sheetEdge("lab-page-gap", this.gaps.length + 1);
      const endSpacer = this.end.previousElementSibling!;
      this.root.insertBefore(this.spacer(), endSpacer);
      this.root.insertBefore(gap, endSpacer);
      this.gaps.push(gap);
    }
    while (this.gaps.length > count) {
      const gap = this.gaps.pop()!;
      gap.previousElementSibling?.remove();
      gap.remove();
    }
    this.end.firstElementChild!.textContent = String(count + 1);
    this.root.dataset.pages = String(count + 1);
  }

  measure() {
    const state = printLayoutKey.getState(this.view.state);
    const dom = this.view.dom as HTMLElement;
    // While printing, the page has no desk: what the screen measured stands.
    if (!state || state.layout !== "print" || !dom.isConnected) return;
    if (typeof matchMedia !== "undefined" && matchMedia("print").matches) return;

    const started = performance.now();
    const metrics = pageMetrics(state.setup);
    const box = () => dom.getBoundingClientRect();
    const scale = box().width / (dom.offsetWidth || 1) || 1;
    const offset = (y: number) => (y - box().top) / scale;

    let passes = 0;
    let wrote = false;
    for (; passes < maxPasses; passes += 1) {
      let changed = this.fitBreaks(dom, metrics, offset);
      const bottom = this.contentBottom(dom, metrics, offset);
      const pages = pagesFor(metrics, bottom);
      if (pages - 1 > this.gaps.length) {
        // Some content ran past the last gap: add gaps (a few spare) and look again.
        this.setGaps(pages + 1);
        wrote = true;
        continue;
      }
      if (pages - 1 < this.gaps.length || this.root.dataset.pages === undefined) {
        // Gaps after the last line move nothing; removing them needs no new pass.
        this.setGaps(pages - 1);
        changed = true;
      }
      wrote ||= changed;
      if (!changed) break;
    }

    const elapsed = performance.now() - started;
    paginationStats.runs += 1;
    paginationStats.passes = passes + 1;
    paginationStats.lastMs = elapsed;
    paginationStats.slowestMs = Math.max(paginationStats.slowestMs, elapsed);
    paginationStats.pages = this.gaps.length + 1;
    if (wrote) {
      paginationStats.writes += 1;
      this.options.onPages?.(this.gaps.length + 1);
    }
  }

  /** Gives each top-level page break the height that reaches the next page. Whether any changed. */
  private fitBreaks(dom: HTMLElement, metrics: PageMetrics, offset: (y: number) => number) {
    let changed = false;
    for (const element of dom.querySelectorAll<HTMLElement>(":scope > .lab-page-break")) {
      // A break inside folded content is not drawn: it is fitted when it is shown again.
      if (!drawn(element)) continue;
      const { fill, atTop } = breakFill(metrics, offset(element.getBoundingClientRect().top));
      const was = Number.parseFloat(element.style.getPropertyValue("--fill") || "NaN");
      const wasAtTop = element.dataset.atTop === "true";
      if (wasAtTop === atTop && (atTop || Math.abs(was - fill) <= tolerance)) continue;
      element.style.setProperty("--fill", `${fill}px`);
      if (atTop) element.dataset.atTop = "true";
      else delete element.dataset.atTop;
      changed = true;
    }
    return changed;
  }

  /** Where the last block ends, from the top of the first sheet. */
  private contentBottom(dom: HTMLElement, metrics: PageMetrics, offset: (y: number) => number) {
    let last = dom.lastElementChild as HTMLElement | null;
    // Not the pages themselves, and not a block that is not drawn (folded, A3.1): it has no bottom.
    while (last && (last === this.root || !drawn(last))) {
      last = last.previousElementSibling as HTMLElement | null;
    }
    return last ? offset(last.getBoundingClientRect().bottom) : metrics.top;
  }
}

/** Whether an element takes part in the layout (one hidden with `display: none` has no boxes). */
const drawn = (element: Element) => element.getClientRects().length > 0;

/** The editor's current layout state. */
export const printLayoutOf = (state: EditorState) => printLayoutKey.getState(state);
