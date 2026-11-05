import {
  pageConfigSchema,
  pageSetupV2Schema,
  type HeaderFooter,
  type PageConfig,
  type PageSetupV2,
} from "../styles/model";
import { defaultMargins, pointsToPx, pxToPoints, type PageSetup } from "./geometry";

/*
 * A sermon's page (A4.3): which paper and margins its pages have, and its
 * header and footer, from `doc.attrs.page`.
 *
 * - **Version 2** is the sermon's own and is all that is consulted: what a
 *   device remembers never overrides it.
 * - **Version 1** (written only by the lab's fixtures) keeps its paper,
 *   margins, running header, and page-number choice; what it cannot say is
 *   drawn as it always was: the title centred, the numbers plain on the right.
 * - **Null**, every document stored before A4.3, is drawn exactly as it was
 *   before: the device's paper and margins, no running header, plain page
 *   numbers on the right. Opening one writes nothing; the first change a
 *   person makes to its page writes version 2 from what it showed.
 *
 * A new outline is given `newDocumentPage()`. Nothing here is view state:
 * the measurements made from it are (`plugin.ts`), and are never stored.
 */

/** How a document with no page of its own, or a version 1 page, draws its header and footer. */
export const historicalHeaderFooter: HeaderFooter = {
  header: { titleAlign: "center" },
  runningHeader: { enabled: false, subtitle: false },
  pageNumbers: { enabled: true, align: "right", weight: "normal" },
};

/** A new outline's header and footer (owner's decision, A4.3): numbers on, right, and bold. */
export const newDocumentHeaderFooter: HeaderFooter = {
  header: { titleAlign: "center" },
  runningHeader: { enabled: false, subtitle: false },
  pageNumbers: { enabled: true, align: "right", weight: "bold" },
};

/** The stored page, when it is one; anything else is no page (it never passes the core's check). */
function parsed(page: unknown): PageConfig | null {
  if (page === null || page === undefined) return null;
  const result = pageConfigSchema.safeParse(page);
  return result.success ? result.data : null;
}

/** The header and footer a stored page draws. */
export function headerFooterOf(page: unknown): HeaderFooter {
  const config = parsed(page);
  if (!config) return historicalHeaderFooter;
  if (config.version === 1) {
    return {
      header: historicalHeaderFooter.header,
      runningHeader: { ...config.runningHeader },
      pageNumbers: { ...historicalHeaderFooter.pageNumbers, enabled: config.pageNumbers.enabled },
    };
  }
  return {
    header: { ...config.header },
    runningHeader: { ...config.runningHeader },
    pageNumbers: { ...config.pageNumbers },
  };
}

/** True when the document says what its paper and margins are; otherwise the device does. */
export const ownsPaper = (page: unknown) => parsed(page) !== null;

/** The paper and margins a stored page has, in the editor's pixels; `device` only when it has none. */
export function setupOf(page: unknown, device: () => PageSetup): PageSetup {
  const config = parsed(page);
  if (!config) return device();
  const { top, right, bottom, left } = config.margins;
  return {
    size: config.paper,
    margins: {
      top: pointsToPx(top),
      right: pointsToPx(right),
      bottom: pointsToPx(bottom),
      left: pointsToPx(left),
    },
  };
}

/** The page every new outline starts with: Letter, one-inch margins, and the new header and footer. */
export function newDocumentPage(): PageSetupV2 {
  const margins = defaultMargins("letter");
  return {
    version: 2,
    paper: "letter",
    margins: {
      top: pxToPoints(margins.top),
      right: pxToPoints(margins.right),
      bottom: pxToPoints(margins.bottom),
      left: pxToPoints(margins.left),
    },
    ...structuredClone(newDocumentHeaderFooter),
  };
}

const bounds = { min: 36, max: 288 };
const inBounds = (points: number) => Math.min(Math.max(points, bounds.min), bounds.max);

/**
 * A version 2 page with this paper and these margins (in pixels) and the
 * header and footer given: what a person's change to a page writes. Null when
 * the result would not be a valid page (it is refused, never adjusted beyond
 * the schema's own bounds).
 */
export function pageWith(setup: PageSetup, headerFooter: HeaderFooter): PageSetupV2 | null {
  const { top, right, bottom, left } = setup.margins;
  const candidate: PageSetupV2 = {
    version: 2,
    paper: setup.size,
    margins: {
      top: inBounds(pxToPoints(top)),
      right: inBounds(pxToPoints(right)),
      bottom: inBounds(pxToPoints(bottom)),
      left: inBounds(pxToPoints(left)),
    },
    ...structuredClone(headerFooter),
  };
  const result = pageSetupV2Schema.safeParse(candidate);
  return result.success ? result.data : null;
}
