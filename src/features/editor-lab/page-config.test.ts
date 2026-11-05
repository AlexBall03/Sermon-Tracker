import { describe, expect, it } from "vitest";

import {
  breakFill,
  contentHeightOf,
  contentTop,
  defaultSetup,
  intoPage,
  pageAt,
  pageMetrics,
  pagesFor,
  paperSizes,
  papers,
  pointsToPx,
  pxToPoints,
} from "./pagination/geometry";
import {
  headerFooterOf,
  historicalHeaderFooter,
  newDocumentHeaderFooter,
  newDocumentPage,
  ownsPaper,
  pageWith,
  setupOf,
} from "./pagination/page-config";
import { pageConfigSchema, pageSetupV2Schema } from "./styles/model";

const v1 = {
  version: 1 as const,
  paper: "a4" as const,
  margins: { top: 54, right: 54, bottom: 54, left: 54 },
  runningHeader: { enabled: true, subtitle: true },
  pageNumbers: { enabled: false },
};
const device = () => ({ ...defaultSetup("legal") });

describe("a sermon's page (A4.3)", () => {
  it("draws a document with no page of its own exactly as before: the device's paper, plain numbers", () => {
    expect(ownsPaper(null)).toBe(false);
    expect(setupOf(null, device)).toEqual(defaultSetup("legal"));
    expect(headerFooterOf(null)).toEqual({
      header: { titleAlign: "center" },
      runningHeader: { enabled: false, subtitle: false },
      pageNumbers: { enabled: true, align: "right", weight: "normal" },
    });
  });

  it("keeps a version 1 page's paper, margins, running header, and page-number choice", () => {
    expect(ownsPaper(v1)).toBe(true);
    const setup = setupOf(v1, device);
    expect(setup.size).toBe("a4");
    expect(setup.margins.top).toBeCloseTo(72);
    expect(headerFooterOf(v1)).toEqual({
      header: { titleAlign: "center" },
      runningHeader: { enabled: true, subtitle: true },
      pageNumbers: { enabled: false, align: "right", weight: "normal" },
    });
  });

  it("lets a version 2 page govern, whatever the device remembers", () => {
    const page = { ...newDocumentPage(), paper: "a5" as const };
    expect(setupOf(page, device).size).toBe("a5");
    expect(headerFooterOf(page)).toEqual(newDocumentHeaderFooter);
  });

  it("gives a new outline Letter, inch margins, a centred title, and bold numbers on the right", () => {
    const page = newDocumentPage();
    expect(pageSetupV2Schema.safeParse(page).success).toBe(true);
    expect(page.pageNumbers).toEqual({ enabled: true, align: "right", weight: "bold" });
    expect(page.header.titleAlign).toBe("center");
    expect(page.runningHeader.enabled).toBe(false);
    expect(historicalHeaderFooter.pageNumbers.weight).toBe("normal");
  });

  it("refuses an unknown field, a bad value, or margins leaving too little text, never adjusting them", () => {
    const page = newDocumentPage();
    for (const bad of [
      { ...page, extra: true },
      { ...page, version: 3 },
      { ...page, header: { titleAlign: "justify" } },
      { ...page, pageNumbers: { ...page.pageNumbers, weight: "black" } },
      { ...page, pageNumbers: { enabled: true } },
      { ...page, margins: { ...page.margins, left: 288, right: 288 } },
      { ...page, margins: { ...page.margins, top: 10 } },
      { ...page, paper: "tabloid" },
    ]) {
      expect(pageConfigSchema.safeParse(bad).success).toBe(false);
    }
    expect(pageConfigSchema.safeParse(v1).success).toBe(true);
  });

  it("writes a person's change as version 2, within the schema's bounds, or not at all", () => {
    const written = pageWith(defaultSetup("a4"), headerFooterOf(v1));
    expect(written).toMatchObject({ version: 2, paper: "a4", runningHeader: v1.runningHeader });
    expect(pageSetupV2Schema.safeParse(written).success).toBe(true);
    // A device margin wider than a page may store is brought within the schema, never past it.
    const wide = pageWith(
      { size: "letter", margins: { top: 96, right: 48, bottom: 96, left: 480 } },
      newDocumentHeaderFooter,
    );
    expect(wide?.margins.left).toBe(288);
    expect(pxToPoints(pointsToPx(72))).toBe(72);
  });
});

describe("a first page unlike the others (A4.3)", () => {
  for (const size of paperSizes) {
    it(`moves only page 0's text area on ${size}`, () => {
      const setup = defaultSetup(size);
      const plain = pageMetrics(setup);
      const header = pageMetrics(setup, undefined, setup.margins.top + 60);
      expect(header.firstTop).toBe(setup.margins.top + 60);
      expect(header.firstContentHeight).toBe(plain.contentHeight - 60);
      expect(contentHeightOf(header, 0)).toBe(plain.contentHeight - 60);
      // Every later page is exactly as it was.
      for (const page of [1, 2, 7]) {
        expect(contentTop(header, page)).toBe(contentTop(plain, page));
        expect(contentHeightOf(header, page)).toBe(plain.contentHeight);
      }
      expect(contentTop(header, 0)).toBe(header.firstTop);
      expect(pageAt(header, header.firstTop + 1)).toBe(0);
      expect(intoPage(header, header.firstTop + 10)).toBe(10);
      // A break near the foot of page 0 fills only what page 0 has left.
      const nearFoot = header.firstTop + header.firstContentHeight - 30;
      expect(breakFill(header, nearFoot)).toEqual({ fill: 30, atTop: false });
      // Content that ends past page 0's text area needs page 1.
      expect(pagesFor(header, header.firstTop + header.firstContentHeight - 1)).toBe(1);
      expect(pagesFor(header, header.firstTop + header.firstContentHeight + 5)).toBe(2);
      expect(header.height).toBe(papers[size].height);
    });
  }

  it("changes nothing when the header fits in the top margin", () => {
    const setup = defaultSetup("letter");
    const inside = pageMetrics(setup, undefined, setup.margins.top - 20);
    expect(inside.firstTop).toBe(setup.margins.top);
    expect(inside.firstContentHeight).toBe(inside.contentHeight);
  });

  it("never pushes the first page's text off the page", () => {
    const setup = defaultSetup("halfLetter");
    const huge = pageMetrics(setup, undefined, 100_000);
    expect(huge.firstContentHeight).toBeGreaterThan(0);
  });
});
