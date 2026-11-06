import { beforeEach, it } from "vitest";

import { createTestDatabase } from "../testing";
import { log, name } from "./log";

beforeEach(async () => {
  name(await createTestDatabase(), "failing-each");
  log("created failing-each");
  throw new Error("beforeEach fails on purpose");
});

it("never runs", () => {
  log("ran never");
});
