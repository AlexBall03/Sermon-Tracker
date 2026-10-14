import { afterEach, describe, expect, it, vi } from "vitest";

import { launchedKey, splashScript } from "./splash-script";

const run = () => new Function(splashScript)();

function installed(standalone: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as never;
}

afterEach(() => {
  delete document.documentElement.dataset.splash;
  sessionStorage.clear();
  document.cookie = "st_splash=; Max-Age=0; path=/";
});

describe("splash script", () => {
  it("shows the splash on the first page of each launch of the installed application", () => {
    installed(true);
    run();
    expect(document.documentElement.dataset.splash).toBe("on");
    expect(sessionStorage.getItem(launchedKey)).toBe("1");

    // A later page of the same launch has no splash.
    delete document.documentElement.dataset.splash;
    run();
    expect(document.documentElement.dataset.splash).toBeUndefined();
  });

  it("shows nothing in a browser tab without the proxy's signal", () => {
    installed(false);
    run();
    expect(document.documentElement.dataset.splash).toBeUndefined();
  });

  it("still follows the proxy's signal, once", () => {
    installed(false);
    document.cookie = "st_splash=1; path=/";
    run();
    expect(document.documentElement.dataset.splash).toBe("on");
    expect(document.cookie).not.toContain("st_splash=1");
  });
});
