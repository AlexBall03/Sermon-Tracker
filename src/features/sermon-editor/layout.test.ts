import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { desktopQuery } from "@/features/editor-lab/pagination/preferences";
import { useDesktop } from "./layout";

/*
 * BUG-010: the print viewport is not a smaller window. Printing lays the page
 * out at the paper's width, under the desktop query's, and the query's
 * `change` used to turn the workspace to Regular Layout mid-print. From
 * `beforeprint` to `afterprint`, and while print media matches, `useDesktop`
 * keeps what it was before the print.
 */

type Listener = () => void;
const media = { desktop: true, print: false };
const listeners = new Map<string, Set<Listener>>();

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === desktopQuery ? media.desktop : query === "print" ? media.print : false;
    },
    media: query,
    addEventListener: (_: string, listener: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(listener);
    },
    removeEventListener: (_: string, listener: Listener) => listeners.get(query)?.delete(listener),
  })) as unknown as typeof window.matchMedia;
}

const changeDesktop = (matches: boolean) => {
  media.desktop = matches;
  for (const listener of listeners.get(desktopQuery) ?? []) listener();
};

const original = window.matchMedia;
beforeEach(() => {
  media.desktop = true;
  media.print = false;
  listeners.clear();
  stubMatchMedia();
});
afterEach(() => {
  window.matchMedia = original;
});

describe("useDesktop and printing (BUG-010)", () => {
  it("follows the window as before", () => {
    const { result } = renderHook(() => useDesktop());
    expect(result.current).toBe(true);
    act(() => changeDesktop(false));
    expect(result.current).toBe(false);
    act(() => changeDesktop(true));
    expect(result.current).toBe(true);
  });

  it("never turns a desktop into a smaller window because of a print", () => {
    const { result } = renderHook(() => useDesktop());
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
      // The print is laid out at the paper's width: the desktop query stops matching.
      media.print = true;
      changeDesktop(false);
    });
    expect(result.current).toBe(true);
    act(() => {
      media.print = false;
      media.desktop = true;
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(result.current).toBe(true);
  });

  it("holds while print media matches, even without a beforeprint", () => {
    const { result } = renderHook(() => useDesktop());
    act(() => {
      media.print = true;
      changeDesktop(false);
    });
    expect(result.current).toBe(true);
    act(() => {
      media.print = false;
      changeDesktop(false);
    });
    expect(result.current).toBe(false);
  });

  it("follows a window that really changed while it printed, once the print ends", () => {
    const { result } = renderHook(() => useDesktop());
    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
      media.print = true;
      changeDesktop(false);
    });
    expect(result.current).toBe(true);
    act(() => {
      media.print = false;
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(result.current).toBe(false);
  });
});
