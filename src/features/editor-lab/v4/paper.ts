import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { printLayoutOf } from "../pagination/plugin";

/*
 * The paper Print Layout is drawn on (A1-UI.1): a display preference, never
 * part of the outline, never a change, never in history, and never what is
 * printed (printing always draws the paper colors, `lab.css`).
 *
 * - "light", the default: white paper in either application theme. The
 *   desk, the toolbar, and everything around the sheet follow the theme.
 *   On the editor as `data-paper="light"`, which takes the light theme's
 *   tokens (`globals.css`) and turns off every dark-theme variant inside the
 *   sheet (`styles/render.ts`, `lab.css`, `v4/lab-v4.css`), so text, colors,
 *   and component treatments show as they would print.
 * - "dark": the sheet follows a dark application theme, as Regular Layout
 *   does. This is the approved dark-paper preference (Word's Switch
 *   Background), independent of the presentation preset; its control is
 *   A1-UI.2, which needs only to dispatch `paperMeta`.
 *
 * Regular Layout has no paper: it always follows the theme.
 */

export const paperThemes = ["light", "dark"] as const;
export type PaperTheme = (typeof paperThemes)[number];

export const paperKey = new PluginKey<PaperTheme>("labV4Paper");

/** The meta that changes the paper (a `PaperTheme`), view state only. */
export const paperMeta = paperKey;

export const PaperV4 = Extension.create<{ initial: PaperTheme }>({
  name: "v4Paper",
  addOptions() {
    return { initial: "light" };
  },
  addProseMirrorPlugins() {
    const initial = this.options.initial;
    return [
      new Plugin<PaperTheme>({
        key: paperKey,
        state: {
          init: () => initial,
          apply: (tr, previous) => (tr.getMeta(paperKey) as PaperTheme | undefined) ?? previous,
        },
        props: {
          attributes: (state): Record<string, string> =>
            printLayoutOf(state)?.layout === "print"
              ? { "data-paper": paperKey.getState(state) ?? initial }
              : {},
        },
      }),
    ];
  },
});
