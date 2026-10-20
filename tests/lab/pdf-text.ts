import { inflateSync } from "node:zlib";

/*
 * The text lines on each page of a PDF that Chrome printed (PS-1B.2B.1, for
 * P1 and P11), with no dependency. Test code only, and only for Chrome's own
 * output (Skia): uncompressed object tables, Flate content streams, simple
 * fonts with a ToUnicode map, and text placed with `Tm`/`Td` and shown with
 * `Tj`/`TJ`. Chrome writes text positions in CSS pixels from the top of the
 * first page (it flips the y axis once, with a `cm`), so a line's page is
 * its y divided by the page height. Anything this cannot read is skipped,
 * and a test that needs it will fail rather than pass.
 */

export type PdfLine = { page: number; y: number; text: string };

type Font = Map<number, string>;

function objects(source: string, bytes: Buffer) {
  const found = new Map<number, { dict: string; stream: Buffer | null }>();
  const pattern = /(\d+) 0 obj\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length;
    const end = source.indexOf("endobj", start);
    const body = source.slice(start, end);
    const at = body.indexOf("stream");
    let stream: Buffer | null = null;
    let dict = body;
    if (at >= 0 && body.slice(0, at).trimEnd().endsWith(">>")) {
      dict = body.slice(0, at);
      let from = start + at + "stream".length;
      if (source[from] === "\r") from += 1;
      if (source[from] === "\n") from += 1;
      const to = source.indexOf("endstream", from);
      const raw = bytes.subarray(from, to);
      try {
        stream = /FlateDecode/.test(dict) ? inflateSync(raw) : raw;
      } catch {
        stream = null;
      }
    }
    found.set(Number(match[1]), { dict, stream });
  }
  return found;
}

const hex = (value: string) => Number.parseInt(value, 16);

/** A ToUnicode CMap: one-byte (or two-byte) codes to text. */
function cmap(text: string): Font {
  const map: Font = new Map();
  const unicode = (value: string) =>
    String.fromCodePoint(
      ...(value.match(/.{4}/g) ?? []).map(hex).filter((code) => code !== 0xfeff),
    );
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, value] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(hex(code), unicode(value));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, from, to, value] of block[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      for (let code = hex(from), offset = 0; code <= hex(to); code += 1, offset += 1) {
        map.set(code, String.fromCodePoint(hex(value) + offset));
      }
    }
  }
  return map;
}

/** Every line of text, with the page it is on, top to bottom. */
export function pdfLines(bytes: Buffer, pageHeight: number): PdfLine[] {
  const source = bytes.toString("latin1");
  const table = objects(source, bytes);

  // Font resource names (/F4) to their ToUnicode maps, from every page's resources.
  const fonts = new Map<string, { font: Font; width: number }>();
  for (const { dict } of table.values()) {
    const resources = dict.match(/\/Font\s*<<([^>]*)>>/);
    if (!resources) continue;
    for (const [, name, id] of resources[1].matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const font = table.get(Number(id));
      const toUnicode = font?.dict.match(/\/ToUnicode\s+(\d+) 0 R/);
      const descendant = font?.dict.match(/\/DescendantFonts\s*\[\s*(\d+) 0 R/);
      const map = toUnicode ? table.get(Number(toUnicode[1]))?.stream : null;
      if (!map) continue;
      fonts.set(name, { font: cmap(map.toString("latin1")), width: descendant ? 2 : 1 });
    }
  }

  const runs: { y: number; x: number; text: string }[] = [];
  for (const { stream, dict } of table.values()) {
    if (!stream || /\/Type\s*\/(XObject|Font)|ToUnicode|\/Length1/.test(dict)) continue;
    const content = stream.toString("latin1");
    if (!/\bBT\b/.test(content)) continue;
    let font: { font: Font; width: number } | undefined;
    let x = 0;
    let y = 0;
    const tokens = content.matchAll(
      /\/(\w+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+Td|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ/g,
    );
    for (const token of tokens) {
      if (token[1]) font = fonts.get(token[1]);
      else if (token[2] !== undefined) {
        x = Number(token[6]);
        y = Number(token[7]);
      } else if (token[8] !== undefined) {
        x += Number(token[8]);
        y += Number(token[9]);
      } else if (font) {
        const strings =
          token[10] !== undefined
            ? [token[10]]
            : [...(token[11] ?? "").matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => m[1]);
        const size = font.width * 2;
        let text = "";
        for (const string of strings) {
          for (let at = 0; at + size <= string.length; at += size) {
            text += font.font.get(hex(string.slice(at, at + size))) ?? "";
          }
        }
        runs.push({ x, y, text });
      }
    }
  }

  // Runs within a few pixels of each other make one line (a raised verse
  // number is a little above its line), read left to right.
  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: { y: number; runs: typeof runs }[] = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && run.y - last.runs[0].y < 6) {
      last.runs.push(run);
      last.y = Math.max(last.y, run.y);
    } else groups.push({ y: run.y, runs: [run] });
  }
  return groups.map((group) => ({
    page: Math.floor(group.y / pageHeight),
    y: group.y,
    text: group.runs
      .sort((a, b) => a.x - b.x)
      .map((run) => run.text)
      .join(""),
  }));
}

/** Text compared without spaces: the PDF does not always draw the space glyph. */
export const squeeze = (text: string) => text.replace(/\s+/g, "");
