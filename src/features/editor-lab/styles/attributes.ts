import { Extension } from "@tiptap/core";
import type { z } from "zod";

import { appearanceSchemas, paragraphFormatSchema, paragraphStyleNames } from "./model";
import { formatStyle } from "./paragraph-css";

/*
 * The node attributes of the style system (schema v3, PS-1B.2B.2 B.2A):
 *
 * - `styleName` on a paragraph: null (Normal), "title", or "subtitle";
 * - `format` on a paragraph or heading: its own paragraph overrides;
 * - `appearance` on a component (section, point, passage, note, script):
 *   its own overrides of its component style.
 *
 * Each is null by default and is written to HTML as a `data-` attribute, so
 * copy and paste inside the application carry it. What comes back from HTML
 * is checked against the same schema the validator uses: anything else
 * (another application's markup, a hand-edited value) gives null, never a
 * value the validator would refuse. A `format` is drawn inline (B.2B); an
 * `appearance` is drawn in B.2C.
 */

/** The component schema that checks each node type's `appearance`. */
export const appearanceSchemaFor: Record<string, z.ZodType> = {
  // Introduction and conclusion take the same properties; so do points at every depth.
  sermonSection: appearanceSchemas.introduction,
  outlinePoint: appearanceSchemas.point,
  scripturePassage: appearanceSchemas.scripture,
  preacherNote: appearanceSchemas.preacherNote,
  script: appearanceSchemas.script,
};

/** An object attribute kept as JSON in a `data-` attribute, read back only when `schema` accepts it. */
function checkedJson(name: string, schema: z.ZodType) {
  const attribute = `data-${name}`;
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(attribute);
      if (!raw) return null;
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] === null || attributes[name] === undefined
        ? {}
        : { [attribute]: JSON.stringify(attributes[name]) },
  };
}

export const StyleAttributes = Extension.create({
  name: "styleAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          styleName: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const value = element.getAttribute("data-style-name");
              return (paragraphStyleNames as readonly (string | null)[]).includes(value)
                ? value
                : null;
            },
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.styleName ? { "data-style-name": attributes.styleName } : {},
          },
        },
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          format: {
            ...checkedJson("format", paragraphFormatSchema),
            // The data attribute for copy and paste, and the overrides drawn inline (B.2B).
            renderHTML: (attributes: Record<string, unknown>) => {
              const format = attributes.format as Record<string, number> | null | undefined;
              if (!format || !paragraphFormatSchema.safeParse(format).success) return {};
              return { "data-format": JSON.stringify(format), style: formatStyle(format) };
            },
          },
        },
      },
      ...Object.entries(appearanceSchemaFor).map(([type, schema]) => ({
        types: [type],
        attributes: { appearance: checkedJson("appearance", schema) },
      })),
    ];
  },
});
