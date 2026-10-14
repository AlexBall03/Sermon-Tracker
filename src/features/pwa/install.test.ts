import { describe, expect, it } from "vitest";

import { installGuide, type InstallContext } from "./install";

const ua = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
};

const at = (userAgent: string, change: Partial<InstallContext> = {}) =>
  installGuide({
    userAgent,
    maxTouchPoints: 0,
    standalone: false,
    canPrompt: false,
    justInstalled: false,
    ...change,
  });

describe("installGuide", () => {
  it("says nothing more once running installed, or just installed", () => {
    expect(at(ua.android, { standalone: true, canPrompt: true })).toBe("installed");
    expect(at(ua.windowsEdge, { justInstalled: true })).toBe("just-installed");
  });

  it("offers the browser's own prompt wherever there is one", () => {
    expect(at(ua.windowsEdge, { canPrompt: true })).toBe("prompt");
    expect(at(ua.android, { canPrompt: true })).toBe("prompt");
  });

  it("describes each platform where there is no prompt", () => {
    expect(at(ua.iphone)).toBe("ios");
    // An iPad says it is a Mac; its touch screen gives it away.
    expect(at(ua.ipadAsMac, { maxTouchPoints: 5 })).toBe("ios");
    expect(at(ua.ipadAsMac)).toBe("mac-safari");
    expect(at(ua.android)).toBe("android");
    expect(at(ua.androidFirefox)).toBe("android");
    expect(at(ua.windowsEdge)).toBe("desktop");
    expect(at(ua.macChrome)).toBe("desktop");
    expect(at(ua.windowsFirefox)).toBe("unsupported");
    expect(at("Something/1.0")).toBe("unknown");
  });
});
