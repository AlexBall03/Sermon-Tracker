import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

import { printLayoutOf } from "../pagination/plugin";
import { isPrinting } from "../pagination/printing";

/*
 * The paper the sermon is written on (A1-UI.1; its control A4.4, A1-UI.2D): a
 * display preference of this device, never part of the outline, never a
 * change, never in history, and never what is printed.
 *
 * - "automatic", the default: the look before A4.4. Print Layout is white
 *   paper in either application theme (`data-paper="light"`); Regular Layout
 *   has no paper of its own and follows the theme.
 * - "light": white paper in both layouts, whatever the theme.
 * - "dark": dark paper in both layouts, whatever the theme (Word's Switch
 *   Background).
 *
 * On the editor as `data-paper`. Light paper takes the light theme's tokens
 * (`globals.css`); dark paper takes the document's dark tokens, scoped to the
 * document surface only (`lab.css`), never the application's chrome. Every
 * dark-variant rule inside the sheet (`styles/render.ts`, `lab.css`,
 * `v4/lab-v4.css`) applies on screen to dark paper, or to no paper in the
 * dark theme. Stored colors are never rewritten: dark paper draws each
 * color's existing dark variant (`styles/colors.ts`).
 *
 * While the editor is printing the paper is always light, so a print is never
 * dark; the print rules (`lab.css`) set the paper's ink as well.
 */

export const paperThemes = ["automatic", "light", "dark"] as const;
export type PaperTheme = (typeof paperThemes)[number];
/** The paper drawn: light, dark, or none (the theme's). */
export type PaperShown = "light" | "dark" | null;

export const paperKey = new PluginKey<PaperTheme>("labV4Paper");

/** The meta that changes the paper (a `PaperTheme`), view state only. */
export const paperMeta = paperKey;

const isPaperTheme = (value: unknown): value is PaperTheme =>
  typeof value === "string" && (paperThemes as readonly string[]).includes(value);

/** The paper an editor in this state draws. */
export function paperShown(state: EditorState): PaperShown {
  const print = printLayoutOf(state)?.layout === "print";
  if (isPrinting(state)) return print ? "light" : null;
  const chosen = paperKey.getState(state) ?? "automatic";
  if (chosen === "automatic") return print ? "light" : null;
  return chosen;
}

export const PaperV4 = Extension.create<{ initial: PaperTheme | (() => PaperTheme) }>({
  name: "v4Paper",
  addOptions() {
    return { initial: "automatic" };
  },
  addProseMirrorPlugins() {
    const { initial } = this.options;
    // Read each time the state is made (a document loaded makes it again), so it is the device's choice now.
    const start = (): PaperTheme => {
      const value = typeof initial === "function" ? initial() : initial;
      return isPaperTheme(value) ? value : "automatic";
    };
    return [
      new Plugin<PaperTheme>({
        key: paperKey,
        state: {
          init: start,
          apply: (tr, previous) => {
            const next = tr.getMeta(paperKey) as unknown;
            return isPaperTheme(next) ? next : previous;
          },
        },
        props: {
          attributes: (state): Record<string, string> => {
            const shown = paperShown(state);
            return shown ? { "data-paper": shown } : {};
          },
        },
      }),
    ];
  },
});
