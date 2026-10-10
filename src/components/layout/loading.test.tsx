import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.query),
}));

import { splashCookie } from "@/lib/splash";
import { navigationStartEvent, NavigationProgress, progressTiming } from "./navigation-progress";
import { SplashController, splashTiming } from "./splash-controller";

const root = document.documentElement;
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const setReadyState = (value: DocumentReadyState) =>
  Object.defineProperty(document, "readyState", { value, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(state, { pathname: "/", query: "" });
  delete root.dataset.splash;
  delete window.__splashAt;
  document.cookie = `${splashCookie}=; Max-Age=0; path=/`;
  setReadyState("complete");
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SplashController", () => {
  /** What the inline script does before the page paints. */
  const raise = () => {
    root.dataset.splash = "on";
    window.__splashAt = performance.now();
  };

  it("does nothing when no splash was raised", () => {
    render(<SplashController />);
    tick(splashTiming.visibleMs * 2);
    expect(root.dataset.splash).toBeUndefined();
  });

  it("keeps the splash up for its full time, fades it, then removes it", () => {
    raise();
    render(<SplashController />);
    tick(splashTiming.visibleMs - 1);
    expect(root.dataset.splash).toBe("on");
    tick(1);
    expect(root.dataset.splash).toBe("leaving");
    tick(splashTiming.fadeMs - 1);
    expect(root.dataset.splash).toBe("leaving");
    tick(1);
    expect(root.dataset.splash).toBeUndefined();
  });

  it("counts the time from when the splash went up, not from when the script arrived", () => {
    raise();
    vi.advanceTimersByTime(1500);
    render(<SplashController />);
    tick(splashTiming.visibleMs - 1500 - 1);
    expect(root.dataset.splash).toBe("on");
    tick(1);
    expect(root.dataset.splash).toBe("leaving");
  });

  it("goes at once when the page took longer than the minimum", () => {
    raise();
    vi.advanceTimersByTime(splashTiming.visibleMs + 3000);
    render(<SplashController />);
    tick(0);
    expect(root.dataset.splash).toBe("leaving");
  });

  it("waits for a page that is still loading, but not for ever", () => {
    setReadyState("loading");
    raise();
    render(<SplashController />);
    tick(splashTiming.visibleMs + 1000);
    expect(root.dataset.splash).toBe("on");

    act(() => void window.dispatchEvent(new Event("load")));
    tick(0);
    expect(root.dataset.splash).toBe("leaving");
    tick(splashTiming.fadeMs);
    expect(root.dataset.splash).toBeUndefined();

    // A page whose load never fires is given up on.
    raise();
    const view = render(<SplashController />);
    tick(splashTiming.giveUpMs);
    expect(root.dataset.splash).toBe("leaving");
    view.unmount();
  });

  it("survives its effect being run twice, as React does in development", () => {
    raise();
    const view = render(<SplashController />);
    // Unmounting cancels the timers and leaves the splash alone...
    view.unmount();
    expect(root.dataset.splash).toBe("on");
    // ...and the next mount takes it from there, on the original clock.
    render(<SplashController />);
    tick(splashTiming.visibleMs);
    expect(root.dataset.splash).toBe("leaving");
    tick(splashTiming.fadeMs);
    expect(root.dataset.splash).toBeUndefined();
  });

  it("raises the splash for a sign-in that arrives by navigation, once", () => {
    const view = render(<SplashController />);
    expect(root.dataset.splash).toBeUndefined();

    // The proxy's signal arrives with the navigation that follows signing in.
    document.cookie = `${splashCookie}=1; path=/`;
    state.pathname = "/dashboard";
    view.rerender(<SplashController />);
    expect(root.dataset.splash).toBe("on");
    expect(document.cookie).not.toContain(splashCookie);

    tick(splashTiming.visibleMs);
    expect(root.dataset.splash).toBe("leaving");
    tick(splashTiming.fadeMs);
    expect(root.dataset.splash).toBeUndefined();

    // Ordinary navigation afterwards shows nothing.
    state.pathname = "/library";
    view.rerender(<SplashController />);
    expect(root.dataset.splash).toBeUndefined();
  });

  it("starts over cleanly if it is raised again while leaving", () => {
    raise();
    const view = render(<SplashController />);
    tick(splashTiming.visibleMs + 100);
    expect(root.dataset.splash).toBe("leaving");

    document.cookie = `${splashCookie}=1; path=/`;
    state.pathname = "/dashboard";
    view.rerender(<SplashController />);
    expect(root.dataset.splash).toBe("on");
    // The earlier fade's removal no longer fires.
    tick(splashTiming.fadeMs);
    expect(root.dataset.splash).toBe("on");
    tick(splashTiming.visibleMs - splashTiming.fadeMs);
    expect(root.dataset.splash).toBe("leaving");
  });
});

describe("NavigationProgress", () => {
  const bar = () => document.querySelector<HTMLElement>("[data-nav-progress]")!;
  const navigate = (url: string) =>
    act(() => void window.dispatchEvent(new CustomEvent(navigationStartEvent, { detail: url })));
  /** The router has arrived: the address changes and the component re-renders. */
  const arrive = (view: ReturnType<typeof render>, pathname: string, query = "") => {
    Object.assign(state, { pathname, query });
    window.history.replaceState(null, "", pathname + (query ? `?${query}` : ""));
    view.rerender(<NavigationProgress />);
  };
  const settle = () => tick(progressTiming.visibleMs + progressTiming.finishMs);

  it("is already running in the server's HTML, and finishes when the page has loaded", () => {
    setReadyState("loading");
    render(<NavigationProgress />);
    expect(bar().dataset.state).toBe("loading");
    expect(bar()).toHaveAttribute("aria-hidden");

    tick(2000);
    expect(bar().dataset.state).toBe("loading");
    act(() => void window.dispatchEvent(new Event("load")));
    tick(0);
    expect(bar().dataset.state).toBe("done");
    tick(progressTiming.finishMs);
    expect(bar().dataset.state).toBe("idle");
  });

  it("runs from the start of a navigation until the new page is shown", () => {
    const view = render(<NavigationProgress />);
    settle();
    expect(bar().dataset.state).toBe("idle");

    navigate("/library");
    expect(bar().dataset.state).toBe("loading");
    tick(4000);
    expect(bar().dataset.state).toBe("loading");

    arrive(view, "/library");
    tick(0);
    expect(bar().dataset.state).toBe("done");
    tick(progressTiming.finishMs);
    expect(bar().dataset.state).toBe("idle");
  });

  it("stays visible long enough to be seen when the navigation is instant", () => {
    const view = render(<NavigationProgress />);
    settle();
    navigate("/library");
    arrive(view, "/library");
    tick(progressTiming.visibleMs - 1);
    expect(bar().dataset.state).toBe("loading");
    tick(1);
    expect(bar().dataset.state).toBe("done");
  });

  it("counts a change of query string as an arrival", () => {
    const view = render(<NavigationProgress />);
    settle();
    navigate("/library?kind=sermon");
    arrive(view, "/", "kind=sermon");
    settle();
    expect(bar().dataset.state).toBe("idle");
  });

  it("finishes by itself for a navigation to the page already shown", () => {
    render(<NavigationProgress />);
    settle();
    navigate("/#preview");
    expect(bar().dataset.state).toBe("loading");
    tick(progressTiming.sameUrlMs);
    expect(bar().dataset.state).toBe("done");
  });

  it("restarts for a second navigation and never hangs on one that goes nowhere", () => {
    const view = render(<NavigationProgress />);
    settle();
    navigate("/library");
    tick(1000);
    navigate("/settings");
    expect(bar().dataset.state).toBe("loading");
    // The first navigation's timers are gone: only the second one's arrival ends it.
    arrive(view, "/settings");
    settle();
    expect(bar().dataset.state).toBe("idle");

    navigate("/never");
    tick(progressTiming.giveUpMs);
    expect(bar().dataset.state).toBe("done");
  });
});
