import { beforeAll, it } from "vitest";

import { createTestDatabase } from "../testing";
import { log, name } from "./log";

beforeAll(async () => {
  name(await createTestDatabase(), "failing-all");
  log("created failing-all");
  throw new Error("beforeAll fails on purpose");
});

it("never runs", () => {
  log("ran never");
});
