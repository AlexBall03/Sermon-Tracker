import { describe, expect, it } from "vitest";

import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { settledDelete, settledRename, settledReplace } from "./reconcile";

const look = (preset: AppearanceSnapshot["preset"]): AppearanceSnapshot => ({
  version: 1,
  preset,
  presetRevision: 2,
  numbering: { version: 1, preset: "decimal" },
});

describe("settling a change whose answer never came", () => {
  it("rename: applied, not applied, or overtaken", () => {
    const sent = { expectedRevision: 3, name: "New" };
    expect(settledRename(sent, { revision: 4, name: "New" })).toBe("applied");
    expect(settledRename(sent, { revision: 3, name: "Old" })).toBe("not_applied");
    expect(settledRename(sent, { revision: 3, name: "New" })).toBe("applied");
    expect(settledRename(sent, { revision: 4, name: "Other" })).toBe("superseded");
    expect(settledRename(sent, { revision: 6, name: "New" })).toBe("superseded");
    expect(settledRename(sent, null)).toBe("superseded");
  });

  it("replace: compares the stored appearance as jsonb does", () => {
    const sent = { expectedRevision: 1, appearance: look("expressive") };
    const reordered = Object.fromEntries(
      Object.entries(look("expressive")).reverse(),
    ) as AppearanceSnapshot;
    expect(settledReplace(sent, { revision: 2, name: "A", appearance: reordered })).toBe("applied");
    expect(settledReplace(sent, { revision: 1, name: "A", appearance: look("balanced") })).toBe(
      "not_applied",
    );
    expect(settledReplace(sent, { revision: 2, name: "A", appearance: look("minimal") })).toBe(
      "superseded",
    );
    expect(settledReplace(sent, null)).toBe("superseded");
  });

  it("delete: gone is done; still at the revision named is not", () => {
    expect(settledDelete({ expectedRevision: 2 }, null)).toBe("applied");
    expect(settledDelete({ expectedRevision: 2 }, { revision: 2, name: "A" })).toBe("not_applied");
    expect(settledDelete({ expectedRevision: 2 }, { revision: 3, name: "A" })).toBe("superseded");
  });
});
