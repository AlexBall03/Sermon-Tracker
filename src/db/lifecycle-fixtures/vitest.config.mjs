// Runs the database lifecycle fixtures in a child Vitest (src/db/test-lifecycle.test.ts),
// with the suite's own setup file. They are not part of the suite: two fail on purpose.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

import base from "../../../vitest.config.mts";

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../../..", import.meta.url)),
  test: {
    ...base.test,
    include: ["src/db/lifecycle-fixtures/*.fixture.ts"],
    environment: "node",
    maxWorkers: 1,
  },
});
