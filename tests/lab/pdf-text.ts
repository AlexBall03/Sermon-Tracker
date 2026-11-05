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

/**
 * Every line of text, with the page it is on, top to bottom.
 *
 * `placed` (A4.3): where each line is drawn, through the graphics state (a
 * positioned element such as a page number or a running header has its own
 * `cm`), in CSS pixels from the top of its page plus the pages before it.
 * Left out, positions are the text matrices' own, as every caller before
 * A4.3 measured them (P1 reads a print with `@page` margins as a column of
 * text areas).
 */
export function pdfLines(
  bytes: Buffer,
  pageHeight: number,
  { placed = false }: { placed?: boolean } = {},
): PdfLine[] {
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

  /*
   * The pages in order (the page tree's /Kids), each with its content stream
   * and its height in points. Text is placed through the graphics state:
   * every `cm` (a page's own offset, and the one Chrome gives each positioned
   * element: a page number, a running header) is followed, so a line's
   * position is where it is drawn on its page (A4.3), not where its text
   * matrix alone would put it.
   */
  type Matrix = [number, number, number, number, number, number];
  const apply = (m: Matrix, px: number, py: number) => ({
    x: m[0] * px + m[2] * py + m[4],
    y: m[1] * px + m[3] * py + m[5],
  });
  // `inner` drawn inside `outer`: a point goes through `inner` first.
  const within = (inner: Matrix, outer: Matrix): Matrix => [
    inner[0] * outer[0] + inner[1] * outer[2],
    inner[0] * outer[1] + inner[1] * outer[3],
    inner[2] * outer[0] + inner[3] * outer[2],
    inner[2] * outer[1] + inner[3] * outer[3],
    inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
    inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
  ];
  const kids = source.match(/\/Type\s*\/Pages[^]*?\/Kids\s*\[([^\]]*)\]/);
  const pageIds = kids ? [...kids[1].matchAll(/(\d+) 0 R/g)].map((match) => Number(match[1])) : [];
  const pages = pageIds.flatMap((id) => {
    const dict = table.get(id)?.dict ?? "";
    const contents = dict.match(/\/Contents\s+(\d+) 0 R/);
    const box = dict.match(/\/MediaBox\s*\[\s*[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s*\]/);
    const stream = contents ? table.get(Number(contents[1]))?.stream : null;
    return stream ? [{ stream, heightPt: box ? Number(box[1]) : (pageHeight * 72) / 96 }] : [];
  });

  const runs: { y: number; x: number; text: string }[] = [];
  pages.forEach(({ stream, heightPt }, pageIndex) => {
    const content = stream.toString("latin1");
    if (!/\bBT\b/.test(content)) return;
    let font: { font: Font; width: number } | undefined;
    let x = 0;
    let y = 0;
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const saved: Matrix[] = [];
    const tokens = content.matchAll(
      /\/(\w+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+Td|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm|(?<![\w/])([qQ])(?![\w])/g,
    );
    for (const token of tokens) {
      if (token[12] !== undefined) {
        ctm = within(token.slice(12, 18).map(Number) as Matrix, ctm);
      } else if (token[18] === "q") saved.push(ctm);
      else if (token[18] === "Q") ctm = saved.pop() ?? ctm;
      else if (token[1]) font = fonts.get(token[1]);
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
        // Points from the page's foot to CSS pixels from its top, then from the first page's top.
        if (!placed) {
          runs.push({ x, y, text });
          continue;
        }
        const at = apply(ctm, x, y);
        runs.push({
          x: (at.x * 96) / 72,
          y: pageIndex * pageHeight + ((heightPt - at.y) * 96) / 72,
          text,
        });
      }
    }
  });

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
