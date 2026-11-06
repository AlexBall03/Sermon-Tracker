import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, vi } from "vitest";

import { testDatabaseLifecycle } from "@/db/test-lifecycle";
import { testPreferences } from "@/features/preferences/testing";

// In-memory databases are closed when their test or file ends (src/db/test-lifecycle.ts).
// Registered here, first, so they run before a file's own `beforeEach` and after
// its own `afterEach` and `afterAll`, which may still use the database.
beforeEach(() => testDatabaseLifecycle.beforeEach());
afterEach(() => testDatabaseLifecycle.afterEach());
afterAll(() => testDatabaseLifecycle.afterAll());

// The language and translation in force come from the session and the database.
// No test has either, so every test reads them from `testPreferences` instead
// (features/preferences/testing.ts), which a test sets to be Spanish, or to
// have Spanish switched off. The rule that resolves them is the real one.
vi.mock("@/features/preferences/current", () => ({
  getPreferences: async () => testPreferences.current(),
}));

afterEach(() => {
  cleanup();
  testPreferences.reset();
});
