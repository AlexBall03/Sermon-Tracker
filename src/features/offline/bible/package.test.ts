// @vitest-environment node
import { describe, expect, it } from "vitest";

import { datasets } from "../../../../scripts/bible/dataset.mjs";
import { translationIds } from "@/features/scripture/translations";
import { committedEditions } from "./package";

describe("committedEditions", () => {
  it("are the checksums the datasets are built and loaded with", () => {
    for (const id of translationIds) {
      expect(committedEditions[id]).toEqual({
        text: datasets[id].checksum,
        titles: datasets[id].titlesChecksum,
      });
    }
  });
});
