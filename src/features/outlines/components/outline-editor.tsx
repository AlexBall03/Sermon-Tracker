"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import {
  addEntry,
  deleteOutline,
  moveEntry,
  removeEntry,
  setOutlineNumbering,
  updateEntry,
} from "../actions";
import {
  nothingCollapsed,
  readCollapsed,
  storeCollapsed,
  subscribeCollapsed,
} from "../editor/collapsed";
import type { Drop } from "../editor/drop";
import { moveTarget, type MoveDirection } from "../editor/moves";
import {
  createOutlineStore,
  type Conflict,
  type EditorRow,
  type OutlineSnapshot,
  type OutlineStore,
} from "../editor/store";
import { outlineLimits, type SectionType } from "../model";
import { numberOutline } from "../numbering";
import { orderEntries, subtreeIds } from "../tree";
import { NumberingDialog } from "./numbering-dialog";
import { ConflictPanel, OutlineRow, type RowActions } from "./outline-row";
import { SaveStatus } from "./save-status";
import { useOutlineDrag } from "./use-outline-drag";

type OutlineEditorProps = {
  /** The outline as the server held it when the page was rendered. */
  snapshot: OutlineSnapshot;
  /** The sermon it is the outline of: where "back" and a deletion lead. */
  sermon: { id: string; title: string };
};

type Focus = { id: string; field: "title" | "notes"; caret?: [number | null, number | null] };

/**
 * A sermon's outline, open for editing. There is no Save button: every change
 * is shown at once and saved by the store (`editor/store.ts`), which owns the
 * outline for as long as the page is open; this component draws what the
 * store holds and asks it for each change.
 *
 * The page may send the outline again (after a change of shape, or when the
 * store asks for it). The store decides what to take from it.
 *
 * Points are moved three ways that all end in the store's `move`: dragging by
 * the grip, the row menu, and Alt+Shift with an arrow in a heading.
 */
export function OutlineEditor({ snapshot, sermon }: OutlineEditorProps) {
  const t = useT("outlines").editor;
  const router = useRouter();
  const toast = useToast();
  const sermonHref = `${routes.library}/${sermon.id}`;

  const [store] = useState<OutlineStore>(() =>
    createOutlineStore(
      snapshot,
      { addEntry, updateEntry, moveEntry, removeEntry, setOutlineNumbering },
      {
        reload: () => router.refresh(),
        messages: { offline: t.offline, reloadFailed: t.reloadFailed },
      },
    ),
  );
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // The page sent the outline again: the store takes what it should.
  const seen = useRef(snapshot);
  useEffect(() => {
    if (seen.current === snapshot) return;
    seen.current = snapshot;
    store.adopt(snapshot);
  }, [snapshot, store]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    const onOnline = () => {
      if (store.getState().status === "failed") store.retry();
    };
    // Closing or reloading the tab would stop a save that is still on its way.
    const onUnload = (event: BeforeUnloadEvent) => {
      if (store.getState().status !== "saved") event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", store.flush);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", store.flush);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onUnload);
      // Left for another page: what is unsaved is sent now, and the store sees it through.
      store.flush();
    };
  }, [store]);

  // Held only for what will not save by itself. A save on its way finishes after leaving.
  const guard = useLeaveGuard(state.status === "failed" || state.status === "conflict", t.leave);

  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => readCollapsed(snapshot.id),
    nothingCollapsed,
  );
  const [notesOpen, setNotesOpen] = useState<ReadonlySet<string>>(new Set());
  const [numberingOpen, setNumberingOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const placed = useMemo(() => orderEntries(state.rows), [state.rows]);
  const labels = useMemo(() => numberOutline(placed, state.numbering), [placed, state.numbering]);
  const introduction = placed.find((row) => row.type === "introduction");
  const conclusion = placed.find((row) => row.type === "conclusion");
  const points = useMemo(() => placed.filter((row) => row.type === "point"), [placed]);

  /** For each point: how many are under it at any depth, and how many are beside it. */
  const { nested, beside } = useMemo(() => {
    const nested = new Map<string, number>();
    const beside = new Map<string | null, number>();
    const open: { id: string; depth: number }[] = [];
    for (const point of points) {
      beside.set(point.parentId, (beside.get(point.parentId) ?? 0) + 1);
      while (open.length > 0 && open[open.length - 1].depth >= point.depth) open.pop();
      for (const above of open) nested.set(above.id, (nested.get(above.id) ?? 0) + 1);
      open.push({ id: point.id, depth: point.depth });
    }
    return { nested, beside };
  }, [points]);

  const container = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const drag = useOutlineDrag({
    list,
    rows: state.rows,
    listed: useMemo(() => shown(points, collapsed, null), [points, collapsed]),
    onDrop: (id, drop: Drop) => {
      if (!store.move(id, drop.parentId, drop.index)) return;
      if (drop.parentId) expand(drop.parentId);
      announceMove(id);
    },
  });
  // A point being dragged carries what is under it out of sight.
  const visible = useMemo(
    () => shown(points, collapsed, drag.dragging?.id ?? null),
    [points, collapsed, drag.dragging?.id],
  );

  // Focus goes where the last action asked, once that row is on the page.
  const focus = useRef<Focus | null>(null);
  useLayoutEffect(() => {
    const want = focus.current;
    if (!want) return;
    const element = container.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-entry-id="${want.id}"] [data-field="${want.field}"]`,
    );
    if (!element) return;
    focus.current = null;
    element.focus();
    if (want.caret) element.setSelectionRange(want.caret[0], want.caret[1]);
  });

  const order = useRef<string[]>([]);
  useEffect(() => {
    order.current = visible.map((point) => point.id);
  });

  function expand(id: string) {
    const folded = readCollapsed(snapshot.id);
    if (!folded.has(id)) return;
    storeCollapsed(
      snapshot.id,
      [...folded].filter((other) => other !== id),
    );
  }

  /** Says where a point now is, for someone who cannot see it move. */
  function announceMove(id: string) {
    const rows = store.getState().rows;
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return;
    const label = numberOutline(orderEntries(rows), store.getState().numbering).get(id) ?? "";
    setAnnouncement(t.moved(row.title.trim() || t.untitled, label));
  }

  function added(id: string | null) {
    if (!id) {
      setResult({ ok: false, message: t.full(outlineLimits.entries) });
      return;
    }
    setResult(null);
    focus.current = { id, field: "title" };
  }

  const handlers = {
    addBelow(id: string) {
      const row = store.getState().rows.find((candidate) => candidate.id === id);
      if (row) added(store.addPoint(row.parentId, row.position + 1));
    },
    addSubpoint(id: string) {
      const made = store.addPoint(id);
      if (made) expand(id);
      added(made);
    },
    move(id: string, direction: MoveDirection) {
      const target = moveTarget(store.getState().rows, id, direction);
      if (!target) return;
      // Moving a row in the page takes the focus off it: note where the caret was.
      const active = document.activeElement;
      const within =
        active instanceof HTMLInputElement &&
        active.closest(`[data-entry-id="${id}"]`) !== null &&
        active.dataset.field === "title";
      if (!store.move(id, target.parentId, target.index)) return;
      if (target.parentId) expand(target.parentId);
      if (within) {
        focus.current = { id, field: "title", caret: [active.selectionStart, active.selectionEnd] };
      }
      announceMove(id);
    },
    remove(id: string) {
      const rows = store.getState().rows;
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return;
      const under = subtreeIds(rows, id).length - 1;
      const done: ActionResult = { ok: true, message: "" };
      if (row.type !== "point") {
        const section = t.sections[row.type];
        setConfirmation({
          title: t.remove.sectionTitle(section),
          description: t.remove.sectionDescription,
          confirmLabel: t.remove.confirm,
          destructive: true,
          run: async () => (store.remove(id), done),
        });
        return;
      }
      if (row.title.trim() === "" && row.notes.trim() === "" && under === 0) {
        // Nothing is lost: it goes at once, and the heading before it takes the focus.
        const at = order.current.indexOf(id);
        const before = order.current[at - 1] ?? order.current[at + 1];
        if (before) focus.current = { id: before, field: "title" };
        store.remove(id);
        return;
      }
      const label = labels.get(id);
      setConfirmation({
        title: t.remove.title,
        description: t.remove.description(
          [label, row.title.trim() || t.untitled].filter(Boolean).join(" "),
          under,
        ),
        confirmLabel: t.remove.confirm,
        destructive: true,
        run: async () => (store.remove(id), done),
      });
    },
    openNotes(id: string) {
      setNotesOpen((open) => new Set(open).add(id));
      focus.current = { id, field: "notes" };
    },
    toggle(id: string) {
      const folded = new Set(readCollapsed(snapshot.id));
      if (!folded.delete(id)) folded.add(id);
      storeCollapsed(snapshot.id, folded);
    },
  };
  // The rows are given one object that never changes; it reaches the latest handlers through this.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const startDrag = drag.start;
  const actions = useMemo<RowActions>(
    () => ({
      setTitle: store.setTitle,
      setNotes: store.setNotes,
      blur: store.blur,
      resolve: store.resolveConflict,
      startDrag,
      addBelow: (id) => latest.current.addBelow(id),
      addSubpoint: (id) => latest.current.addSubpoint(id),
      move: (id, direction) => latest.current.move(id, direction),
      remove: (id) => latest.current.remove(id),
      openNotes: (id) => latest.current.openNotes(id),
      toggle: (id) => latest.current.toggle(id),
    }),
    [store, startDrag],
  );

  async function confirmed(request: Confirmation) {
    setDeleting(true);
    const outcome = await request
      .run()
      .catch((): ActionResult => ({ ok: false, message: t.offline }));
    setDeleting(false);
    setConfirmation(null);
    if (!outcome.ok) setResult(outcome);
    return outcome;
  }

  function askToDeleteOutline() {
    setConfirmation({
      title: t.deleteOutlineTitle,
      description: t.deleteOutlineDescription(sermon.title),
      confirmLabel: t.deleteOutlineConfirm,
      destructive: true,
      run: async () => {
        const outcome = await deleteOutline(snapshot.id);
        if (outcome.ok) {
          // There is nothing left to save or to lose.
          store.dispose();
          guard.allowLeaving();
          toast({ message: outcome.message });
          router.replace(sermonHref);
        }
        return outcome;
      },
    });
  }

  const parents = points.filter((point) => (nested.get(point.id) ?? 0) > 0);
  const full = state.rows.length >= outlineLimits.entries;

  return (
    <>
      <div className="sticky top-(--bar-h) z-20 flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background py-2">
        <SaveStatus status={state.status} problem={state.problem} onRetry={store.retry} />
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setNumberingOpen(true)}>
            <ListOrdered aria-hidden />
            {t.numbering}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t.more}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 data-popup-open:bg-accent data-popup-open:text-foreground pointer-coarse:size-11"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={parents.every((point) => !collapsed.has(point.id))}
                onClick={() => storeCollapsed(snapshot.id, [])}
              >
                <ChevronsUpDown aria-hidden />
                {t.expandAll}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={parents.every((point) => collapsed.has(point.id))}
                onClick={() =>
                  storeCollapsed(
                    snapshot.id,
                    parents.map((point) => point.id),
                  )
                }
              >
                <ChevronsDownUp aria-hidden />
                {t.collapseAll}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={askToDeleteOutline}>
                <Trash2 aria-hidden />
                {t.deleteOutline}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ActionStatus result={result} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {state.reloaded && (
        <div
          role="status"
          className="mt-4 flex max-w-4xl animate-menu items-start gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1">{t.reloaded}</p>
          <button
            type="button"
            aria-label={t.dismiss}
            onClick={store.dismissReloaded}
            className="-my-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {state.lost.length > 0 && (
        <section
          role="alert"
          className="mt-4 max-w-4xl animate-menu rounded-xl border border-destructive/40 bg-surface px-4 py-3"
        >
          <h2 className="text-sm font-semibold">{t.lost.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.lost.body}</p>
          <ul className="mt-3 space-y-3">
            {state.lost.map((draft) => (
              <li key={draft.id} className="border-t pt-3">
                <p className="font-serif font-medium">{draft.title || t.untitled}</p>
                {draft.notes && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                    {draft.notes}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => added(store.restoreLost(draft.id))}
                  >
                    {t.lost.restore}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => store.discardLost(draft.id)}
                  >
                    {t.lost.discard}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        ref={container}
        className="mt-6 max-w-4xl [--outline-cap:45%] [--outline-step:1rem] sm:[--outline-step:1.75rem]"
      >
        <SectionBlock
          type="introduction"
          row={introduction}
          conflict={introduction && state.conflicts[introduction.id]}
          store={store}
          disabled={full}
          onAdd={() => added(store.addSection("introduction"))}
          onRemove={handlers.remove}
        />

        <section aria-labelledby="outline-points" className="mt-6 border-t pt-5">
          <h2 id="outline-points" className="text-lg font-semibold">
            {t.sections.points}
          </h2>
          {points.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
              {t.empty}
            </p>
          ) : (
            <div ref={list} className="relative mt-2">
              <ol>
                {visible.map((point) => (
                  <OutlineRow
                    key={point.id}
                    id={point.id}
                    title={point.title}
                    notes={point.notes}
                    depth={point.depth}
                    label={labels.get(point.id) ?? ""}
                    nested={nested.get(point.id) ?? 0}
                    collapsed={collapsed.has(point.id)}
                    notesOpen={notesOpen.has(point.id)}
                    moves={possibleMoves(point, beside.get(point.parentId) ?? 1)}
                    dragging={drag.dragging?.id === point.id}
                    conflict={state.conflicts[point.id]}
                    actions={actions}
                  />
                ))}
              </ol>
              {drag.dragging && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 h-0.5 -translate-y-px rounded-full bg-primary"
                  style={{
                    top: drag.dragging.top,
                    left: `calc(min(${drag.dragging.drop.depth} * var(--outline-step), var(--outline-cap)) + 1.5rem)`,
                  }}
                />
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={full}
            onClick={() => added(store.addPoint(null))}
          >
            <Plus aria-hidden />
            {t.addPoint}
          </Button>
        </section>

        <SectionBlock
          type="conclusion"
          row={conclusion}
          conflict={conclusion && state.conflicts[conclusion.id]}
          store={store}
          disabled={full}
          onAdd={() => added(store.addSection("conclusion"))}
          onRemove={handlers.remove}
        />
      </div>

      <NumberingDialog
        open={numberingOpen}
        onOpenChange={setNumberingOpen}
        value={state.numbering}
        onApply={store.setNumbering}
      />
      {guard.dialog}
      <ConfirmDialog
        confirmation={confirmation}
        busy={deleting}
        onConfirm={(request) => void confirmed(request)}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}

type Point = EditorRow & { depth: number; path: number[] };

/** The points on screen, in order: every one that is not under a folded point, or under the one being dragged. */
function shown(points: readonly Point[], collapsed: ReadonlySet<string>, draggedId: string | null) {
  const visible: Point[] = [];
  let hiddenBelow: number | null = null;
  for (const point of points) {
    if (hiddenBelow !== null && point.depth > hiddenBelow) continue;
    hiddenBelow = collapsed.has(point.id) || point.id === draggedId ? point.depth : null;
    visible.push(point);
  }
  return visible;
}

/** The ways a point can move from where it is, read from its place alone. */
function possibleMoves(point: Point, beside: number) {
  const place = point.path[point.path.length - 1];
  return [
    place > 1 && "up",
    place < beside && "down",
    place > 1 && "indent",
    point.depth >= 1 && "outdent",
    point.depth >= 2 && "top",
  ]
    .filter(Boolean)
    .join(",");
}

const sectionField =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 transition-[border-color,background-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/70 hover:border-input focus-visible:border-ring focus-visible:bg-surface focus-visible:shadow-focus";

/**
 * The introduction or the conclusion: a section of the sermon and not a
 * point, so it has a name and no number, and it can be added or removed but
 * never moved. Where there is none, the way to add one.
 */
function SectionBlock({
  type,
  row,
  conflict,
  store,
  disabled,
  onAdd,
  onRemove,
}: {
  type: SectionType;
  row: EditorRow | undefined;
  conflict: Conflict | undefined;
  store: OutlineStore;
  disabled: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const t = useT("outlines").editor;
  const name = t.sections[type];
  const first = type === "introduction";

  if (!row) {
    return (
      <div className={cn(!first && "mt-6 border-t pt-5")}>
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-input px-4 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/70 hover:text-foreground active:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden />
          {first ? t.addIntroduction : t.addConclusion}
        </button>
      </div>
    );
  }

  const left = outlineLimits.notes - [...row.notes].length;
  return (
    <section
      data-entry-id={row.id}
      aria-labelledby={`outline-${type}`}
      className={cn(!first && "mt-6 border-t pt-5")}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`outline-${type}`} className="text-lg font-semibold">
          {name}
        </h2>
        <button
          type="button"
          aria-label={`${t.row.delete}: ${name}`}
          onClick={() => onRemove(row.id)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-11"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1 -ml-2">
        <input
          data-field="title"
          value={row.title}
          onChange={(event) => store.setTitle(row.id, event.target.value)}
          onBlur={() => store.blur(row.id)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.parentElement
              ?.querySelector<HTMLElement>('[data-field="notes"]')
              ?.focus();
          }}
          placeholder={t.placeholders[type]}
          aria-label={`${name}: ${t.heading}`}
          maxLength={outlineLimits.title}
          autoComplete="off"
          className={cn(sectionField, "h-9 font-serif text-[1.0625rem] pointer-coarse:h-11")}
        />
        <textarea
          data-field="notes"
          value={row.notes}
          onChange={(event) => store.setNotes(row.id, event.target.value)}
          onBlur={() => store.blur(row.id)}
          placeholder={t.placeholders.notes}
          aria-label={`${name}: ${t.notes}`}
          maxLength={outlineLimits.notes}
          rows={1}
          className={cn(
            sectionField,
            "mt-0.5 block field-sizing-content min-h-8 resize-none py-1.5 text-base leading-relaxed text-muted-foreground focus-visible:text-foreground md:text-sm md:leading-relaxed",
          )}
        />
        {left <= 200 && (
          <p className="px-2 text-right text-xs text-muted-foreground tabular-nums">
            {t.remaining(left)}
          </p>
        )}
        {conflict && (
          <ConflictPanel id={row.id} conflict={conflict} resolve={store.resolveConflict} />
        )}
      </div>
    </section>
  );
}
