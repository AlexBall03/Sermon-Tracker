import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { testPreferences } from "@/features/preferences/testing";

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
