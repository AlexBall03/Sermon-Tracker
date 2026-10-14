import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";
import { PullToRefresh, pullDistance, pullThreshold } from "./pull-to-refresh";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let standalone = true;
vi.mock("../standalone", () => ({ isStandalone: () => standalone }));

function touch(type: string, y: number) {
  const event = new Event(type) as Event & { touches: unknown[] };
  event.touches = type === "touchend" ? [] : [{ clientX: 100, clientY: y }];
  act(() => void window.dispatchEvent(event));
}

function pull(to: number) {
  touch("touchstart", 100);
  touch("touchmove", 100 + to);
}

const view = () =>
  render(
    <I18nProvider locale="en">
      <PullToRefresh />
    </I18nProvider>,
  );

beforeEach(() => {
  standalone = true;
  refresh.mockClear();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});
afterEach(() => document.body.replaceChildren());

describe("PullToRefresh", () => {
  it("holds the pull back and stops at its furthest", () => {
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(1000)).toBeLessThan(200);
  });

  it("says when letting go will refresh, and refreshes the page in place", () => {
    view();
    pull(pullThreshold);
    expect(screen.getByText("Pull to refresh")).toBeInTheDocument();
    touch("touchmove", 100 + pullThreshold * 2 + 10);
    expect(screen.getAllByText("Release to refresh")).not.toHaveLength(0);
    touch("touchend", 0);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("puts the indicator away when let go short of the threshold", () => {
    view();
    pull(40);
    touch("touchend", 0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing below the top of the page or in a browser tab", () => {
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    view();
    pull(400);
    touch("touchend", 0);
    expect(refresh).not.toHaveBeenCalled();

    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    standalone = false;
    view();
    pull(400);
    touch("touchend", 0);
    expect(refresh).not.toHaveBeenCalled();
  });
});
