import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { touchedBlocks } from "../pagination/plugin";
import { appearanceSchemaFor } from "./attributes";
import { inkOn, type ColorValue } from "./colors";
import { componentOfNode, findComponent } from "./component-node";
import { applyPlan, mergeAppearance, mergeStyles, touches, type Draft } from "./draft";
import {
  appearanceSchemas,
  componentStyleSchemas,
  documentStylesSchema,
  userPresetIds,
  type ComponentKind,
  type ComponentStyle,
  type DocumentStyles,
  type UserPresetId,
} from "./model";
import { presets, type Preset, type PresetId } from "./presets";
import { appearanceStyle, styleSheet } from "./render";
import { resolveAt } from "./context";
import { readStyles, resolveComponent } from "./resolve";

/*
 * The document's styles in the editor (PS-1B.2B.2B):
 *
 * - the style sheet (`render.ts`) for the styles in force, kept in one
 *   `<style>` element per editor and replaced only when they change;
 * - a preview: styles shown in place of the document's while the Document
 *   Styles panel is open. It is view state, set by a transaction that carries
 *   only a meta and stays out of history, so it never changes the document,
 *   and Cancel leaves nothing behind;
 * - `applyDocumentStyles`: the one transaction that writes `doc.attrs.styles`
 *   (undone in one step), which also ends the preview;
 * - text on a highlight, judged together (`colors.ts`, `inkOn`): an inline
 *   decoration on each highlighted run gives its text the color that reads on
 *   that fill, in each theme. An exact or per-theme text color is drawn as
 *   chosen. Only the blocks a change touched are looked at again;
 * - the presentation preset (`presets.ts`), the cascade's first level. Since
 *   A1-UI.2B.1 the outline chooses it (`styles.preset`); the editor's
 *   `preset` option is only the default for an outline that chose none. It
 *   is shown on the editor as `data-preset`, and every preset but the
 *   baseline as `data-studio`, for the presets' CSS (`v4/lab-v4.css`);
 * - a single component's own appearance (level 3, A1-UI.2B.1): a node
 *   decoration with its inline style (`render.ts`, `appearanceStyle`), in a
 *   preset that draws components. The node and its attribute are unchanged.
 *
 * Choosing a preset, resetting, and a component type's or a single node's
 * appearance are document changes, one undoable transaction each, through
 * the commands below; they write the smallest value that says it (an empty
 * layer is removed), and never touch another layer.
 */

/**
 * What is previewed, or null for no preview: whole styles (null inside: every
 * default; the v3 lab's Document Styles), or the Appearance panel's draft
 * (A1-UI.2B.2), laid over whatever is committed at each moment.
 */
export type Preview = { styles: DocumentStyles | null } | { draft: Draft } | null;
type StylesState = { preview: Preview; fallback: PresetId };

export const documentStylesKey = new PluginKey<StylesState>("labDocumentStyles");
const pairsKey = new PluginKey<DecorationSet>("labColorPairs");
const appearanceKey = new PluginKey<DecorationSet>("labAppearance");
/** The component the Appearance panel's Selected scope customizes, by ID: view state only. */
export const appearanceTargetKey = new PluginKey<string | null>("labAppearanceTarget");

export { componentOfNode, findComponent };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentStyles: {
      /** Shows the previewed styles in place of the document's; null ends the preview. View state only. */
      setStylesPreview: (preview: Preview) => ReturnType;
      /** Writes the document's styles (null: every default) in one undoable transaction. */
      applyDocumentStyles: (styles: DocumentStyles | null) => ReturnType;
      /** Chooses the outline's preset. Every other style and override is kept. */
      setOutlinePreset: (preset: UserPresetId) => ReturnType;
      /** Takes away every outline-wide style, keeping the chosen preset. Nodes' own overrides stay. */
      resetOutlineToPreset: () => ReturnType;
      /** Sets how every component of a kind looks (null: as the preset draws it). */
      setComponentStyle: (kind: ComponentKind, style: ComponentStyle | null) => ReturnType;
      /** Sets one component's own appearance (null: as its kind looks). Its meaning is unchanged. */
      setComponentAppearance: (pos: number, appearance: ComponentStyle | null) => ReturnType;
      /**
       * Writes the Appearance panel's draft (A1-UI.2B.2): the outline's styles
       * and every component it changes, in one transaction undone in one step,
       * or nothing at all when any part of it is stale or invalid.
       */
      applyAppearanceDraft: (draft: Draft) => ReturnType;
      /** Marks the component the panel customizes (null: none). View state only. */
      setAppearanceTarget: (id: string | null) => ReturnType;
    };
  }
}

/** The styles the editor shows: the preview while there is one, else the document's. */
export function stylesInForce(state: EditorState): DocumentStyles | null {
  const preview = documentStylesKey.getState(state)?.preview;
  const stored = readStyles(state.doc.attrs.styles);
  if (!preview) return stored;
  if ("styles" in preview) return preview.styles;
  return merged(stored, preview.draft);
}

/*
 * A draft laid over the same committed styles is always the same object, so
 * the sheet and the decorations, which compare by identity, are redrawn only
 * when either changes: never per keystroke while the panel is open.
 */
const mergeCache = new WeakMap<
  Draft,
  { stored: DocumentStyles | null; styles: DocumentStyles | null }
>();
function merged(stored: DocumentStyles | null, draft: Draft): DocumentStyles | null {
  const cached = mergeCache.get(draft);
  if (cached && cached.stored === stored) return cached.styles;
  const styles = mergeStyles(stored, draft);
  mergeCache.set(draft, { stored, styles });
  return styles;
}

const draftOf = (state: EditorState): Draft | null => {
  const preview = documentStylesKey.getState(state)?.preview;
  return preview && "draft" in preview ? preview.draft : null;
};

/** A component's own appearance as the editor shows it: with the panel's draft for it, while previewed. */
export function appearanceInForce(
  state: EditorState,
  node: ProseMirrorNode,
): ComponentStyle | null {
  const appearance = (node.attrs.appearance ?? null) as ComponentStyle | null;
  const draft = draftOf(state);
  const id = node.attrs.id as string | null | undefined;
  return draft && id && touches(draft, id) ? mergeAppearance(appearance, draft, id) : appearance;
}

/** Whether a transaction changed what is previewed. */
export const previewChanged = (before: EditorState, after: EditorState): boolean =>
  documentStylesKey.getState(before)?.preview !== documentStylesKey.getState(after)?.preview;

/** The preset `styles` draw with: the one they chose, else the editor's default. */
export function presetIdOf(styles: DocumentStyles | null, state: EditorState): PresetId {
  return styles?.preset ?? documentStylesKey.getState(state)?.fallback ?? "baseline";
}

/** Which preset the editor draws with now (a preview's while there is one). */
export const presetIdInForce = (state: EditorState): PresetId =>
  presetIdOf(stylesInForce(state), state);

/** The presentation preset the editor draws with (the baseline when it has none). */
export function presetInForce(state: EditorState): Preset {
  return presets[presetIdInForce(state)];
}

export const isUserPresetId = (value: unknown): value is UserPresetId =>
  typeof value === "string" && (userPresetIds as readonly string[]).includes(value);

/** `styles` with one change, as stored: null when nothing but the version is left. */
function withStyles(
  styles: DocumentStyles | null,
  change: (next: Record<string, unknown>) => void,
): DocumentStyles | null {
  const next: Record<string, unknown> = { ...(styles ?? { version: 1 }) };
  change(next);
  const { version: _version, ...rest } = next;
  void _version;
  return Object.keys(rest).length ? (next as DocumentStyles) : null;
}

let sheets = 0;

export const DocumentStylesExtension = Extension.create<{ preset: PresetId }>({
  name: "documentStyles",

  addOptions() {
    return { preset: "baseline" };
  },

  addCommands() {
    const write =
      (next: (styles: DocumentStyles | null) => DocumentStyles | null | false) =>
      ({ tr, state, dispatch }: { tr: Transaction; state: EditorState; dispatch?: unknown }) => {
        const styles = next(readStyles(state.doc.attrs.styles));
        if (styles === false) return false;
        if (styles !== null && !documentStylesSchema.safeParse(styles).success) return false;
        if (dispatch) tr.setDocAttribute("styles", styles).setMeta(documentStylesKey, null);
        return true;
      };
    return {
      setStylesPreview:
        (preview) =>
        ({ tr, dispatch }) => {
          if (
            preview &&
            "styles" in preview &&
            preview.styles &&
            !documentStylesSchema.safeParse(preview.styles).success
          ) {
            return false;
          }
          if (dispatch) tr.setMeta(documentStylesKey, preview).setMeta("addToHistory", false);
          return true;
        },
      applyDocumentStyles: (styles) => write(() => styles),
      setOutlinePreset: (preset) =>
        write((styles) =>
          isUserPresetId(preset) && styles?.preset !== preset
            ? withStyles(styles, (next) => (next.preset = preset))
            : false,
        ),
      resetOutlineToPreset: () =>
        write((styles) =>
          styles ? (styles.preset ? { version: 1, preset: styles.preset } : null) : false,
        ),
      setComponentStyle: (kind, style) =>
        write((styles) => {
          if (style !== null && !componentStyleSchemas[kind].safeParse(style).success) return false;
          return withStyles(styles, (next) => {
            const components = { ...((next.components as object | undefined) ?? {}) } as Record<
              string,
              unknown
            >;
            if (style) components[kind] = style;
            else delete components[kind];
            if (Object.keys(components).length) next.components = components;
            else delete next.components;
          });
        }),
      setComponentAppearance:
        (pos, appearance) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || !("appearance" in node.attrs)) return false;
          const kind = componentOfNode(node);
          // A point with a role takes its section's contract (`v4/validate.ts`).
          const schema = kind ? appearanceSchemas[kind] : appearanceSchemaFor[node.type.name];
          if (appearance !== null && !schema?.safeParse(appearance).success) return false;
          if (dispatch) tr.setNodeAttribute(pos, "appearance", appearance);
          return true;
        },
      applyAppearanceDraft:
        (draft) =>
        ({ tr, state, dispatch }) => {
          // The whole plan is checked before anything is written: all of it, or nothing.
          const plan = applyPlan(draft, readStyles(state.doc.attrs.styles), state.doc);
          if (!plan.ok) return false;
          if (plan.styles === undefined && !plan.instances.length) return false;
          if (dispatch) {
            if (plan.styles !== undefined) tr.setDocAttribute("styles", plan.styles);
            // Attributes only: no position moves, so each one found still holds.
            for (const { pos, appearance } of plan.instances) {
              tr.setNodeAttribute(pos, "appearance", appearance);
            }
            // Its own step in history, never joined to the typing before it.
            closeHistory(tr.setMeta(documentStylesKey, null));
          }
          return true;
        },
      setAppearanceTarget:
        (id) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(appearanceTargetKey, id).setMeta("addToHistory", false);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const id = String((sheets += 1));
    const scope = `.lab-editor[data-sheet="${id}"]`;
    const fallback = this.options.preset;
    return [
      new Plugin<StylesState>({
        key: documentStylesKey,
        state: {
          init: () => ({ preview: null, fallback }),
          apply(tr, previous) {
            const meta = tr.getMeta(documentStylesKey) as Preview | undefined;
            return meta === undefined ? previous : { preview: meta, fallback };
          },
        },
        props: {
          attributes: (state): Record<string, string> => {
            const preset = presetIdInForce(state);
            return preset === "baseline"
              ? { "data-sheet": id, "data-preset": preset }
              : { "data-sheet": id, "data-preset": preset, "data-studio": "" };
          },
        },
        view(view) {
          const element = view.dom.ownerDocument.createElement("style");
          element.dataset.labSheet = id;
          view.dom.ownerDocument.head.append(element);
          let shown: { styles: DocumentStyles | null; preset: PresetId } | undefined;
          const draw = (state: EditorState) => {
            const styles = stylesInForce(state);
            const preset = presetIdOf(styles, state);
            if (shown && styles === shown.styles && preset === shown.preset) return;
            shown = { styles, preset };
            element.textContent = styleSheet(styles, scope, presets[preset]);
          };
          draw(view.state);
          return { update: (next) => draw(next.state), destroy: () => element.remove() };
        },
      }),
      new Plugin<DecorationSet>({
        key: pairsKey,
        state: {
          init: (_, state) => pairs(state, 0, state.doc.content.size, DecorationSet.empty),
          apply(tr, previous, before, after) {
            // New styles can change a block's text color: look at the whole document again.
            if (stylesInForce(before) !== stylesInForce(after)) {
              return pairs(after, 0, after.doc.content.size, DecorationSet.empty);
            }
            if (!tr.docChanged) return previous;
            const set = previous.map(tr.mapping, tr.doc);
            const touched = touchedBlocks(tr);
            if (!touched) return set;
            return pairs(
              after,
              touched.start,
              touched.end,
              set.remove(set.find(touched.start, touched.end)),
            );
          },
        },
        props: { decorations: (state) => pairsKey.getState(state) },
      }),
      new Plugin<DecorationSet>({
        key: appearanceKey,
        state: {
          init: (_, state) => appearances(state, 0, state.doc.content.size, DecorationSet.empty),
          apply(tr, previous, before, after) {
            const whole = () => appearances(after, 0, after.doc.content.size, DecorationSet.empty);
            // New styles, another preset, or another draft change what every override resolves to.
            if (stylesInForce(before) !== stylesInForce(after) || previewChanged(before, after)) {
              return whole();
            }
            if (!tr.docChanged) return previous;
            // A change of attributes (an appearance, a role, a depth) has no range to look at.
            const typed = tr.steps.every(
              (step) => step instanceof ReplaceStep || step instanceof ReplaceAroundStep,
            );
            const touched = typed ? touchedBlocks(tr) : null;
            if (!touched) return whole();
            const set = previous.map(tr.mapping, tr.doc);
            return appearances(
              after,
              touched.start,
              touched.end,
              set.remove(set.find(touched.start, touched.end)),
            );
          },
        },
        props: { decorations: (state) => appearanceKey.getState(state) },
      }),
      new Plugin<string | null>({
        key: appearanceTargetKey,
        state: {
          init: () => null,
          apply(tr, previous) {
            const meta = tr.getMeta(appearanceTargetKey) as string | null | undefined;
            return meta === undefined ? previous : meta;
          },
        },
        props: {
          decorations(state) {
            const id = appearanceTargetKey.getState(state);
            const found = id ? findComponent(state.doc, id) : null;
            if (!found) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(found.pos, found.pos + found.node.nodeSize, {
                "data-appearance-target": "",
              }),
            ]);
          },
        },
      }),
    ];
  },
});

const boxed = new Set<ComponentKind>(["scripture", "preacherNote", "script"]);

/**
 * Decorations for every component with its own appearance between `from`
 * and `to`, added to `set`. Only in a preset that draws components (the
 * baseline never drew one); the walk stops at text, so it costs a look at
 * each block, not each character.
 */
function appearances(
  state: EditorState,
  from: number,
  to: number,
  set: DecorationSet,
): DecorationSet {
  const styles = stylesInForce(state);
  const preset = presets[presetIdOf(styles, state)];
  if (!preset.componentColors) return set === DecorationSet.empty ? set : DecorationSet.empty;
  const added: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && node.type.name !== "point") return false;
    const kind = componentOfNode(node);
    if (!kind) return !node.isTextblock;
    const appearance = appearanceInForce(state, node);
    const attrs: Record<string, string> = {};
    if (appearance) {
      const style = appearanceStyle(
        kind,
        resolveComponent(styles, kind, appearance, preset),
        appearance,
      );
      if (style) Object.assign(attrs, { style, "data-own-appearance": "" });
    }
    // A container's accent on another side (A1-UI.2B.2); left, the presets' design, needs nothing.
    if (boxed.has(kind)) {
      const side = resolveComponent(styles, kind, appearance, preset).accentPosition;
      if (side && side !== "left") attrs["data-accent"] = side;
    }
    if (Object.keys(attrs).length) added.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    return !node.isTextblock;
  });
  return added.length ? set.add(state.doc, added) : set;
}

/** Decorations for every highlighted run between `from` and `to`, added to `set`. */
function pairs(state: EditorState, from: number, to: number, set: DecorationSet): DecorationSet {
  const styles = stylesInForce(state);
  const added: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
    if (!node.isText) return true;
    const highlight = node.marks.find((mark) => mark.type.name === "highlight");
    if (!highlight) return false;
    const fill = highlight.attrs.color as ColorValue;
    const marked = node.marks.find((mark) => mark.type.name === "textStyle")?.attrs.color as
      ColorValue | null | undefined;
    // A color the person fixed is theirs: drawn as chosen by its own mark, never adapted.
    if (marked && typeof marked !== "string") return false;
    const ink = marked ?? resolveAt(styles, state.doc.resolve(pos), presetInForce(state)).color;
    if (ink && typeof ink !== "string") return false;
    const light = inkOn(ink, fill, "light");
    const dark = inkOn(ink, fill, "dark");
    if (!light || !dark) return false;
    added.push(
      Decoration.inline(pos, pos + node.nodeSize, {
        class: "lab-ink",
        style: `color: ${light}; --ink-d: ${dark}`,
      }),
    );
    return false;
  });
  return added.length ? set.add(state.doc, added) : set;
}
