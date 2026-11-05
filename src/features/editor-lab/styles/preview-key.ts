import { PluginKey } from "@tiptap/pm/state";

import type { Draft } from "./draft";
import type { DocumentStyles } from "./model";
import type { PresetId } from "./presets";

/*
 * The styles plugin's key and what it holds (`plugin.ts`), in a module of
 * their own so other plugins can read the Appearance draft that is being
 * previewed (the numbering, A4.2A; the page's header and footer, A4.3)
 * without importing the styles plugin, which imports the pagination plugin.
 */

/**
 * What is previewed, or null for no preview: whole styles (null inside: every
 * default; the v3 lab's Document Styles), or the Appearance panel's draft
 * (A1-UI.2B.2), laid over whatever is committed at each moment.
 */
export type Preview = { styles: DocumentStyles | null } | { draft: Draft } | null;
export type StylesState = { preview: Preview; fallback: PresetId };

export const documentStylesKey = new PluginKey<StylesState>("labDocumentStyles");
