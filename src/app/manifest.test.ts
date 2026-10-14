// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

/** A PNG's width and height, from its header. */
function pngSize(path: string) {
  const file = readFileSync(path);
  return `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`;
}

describe("manifest", () => {
  const m = manifest();

  it("opens the installed application on the dashboard, never the public page", () => {
    expect(m.start_url).toBe("/dashboard");
    expect(m.id).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.name).toBe("Sermon Tracker");
  });

  it("names icons that exist at the sizes it says, with maskable ones", () => {
    const icons = m.icons ?? [];
    expect(icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(
      true,
    );
    expect(icons.some((icon) => icon.purpose === "any" && icon.sizes === "192x192")).toBe(true);
    for (const icon of icons) {
      expect(pngSize(`public${icon.src}`)).toBe(icon.sizes);
    }
  });
});
