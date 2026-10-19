import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { dictionary } from "@/i18n";
import { locales, type Locale } from "@/i18n/locales";

const state = vi.hoisted(() => ({ locale: "en" as Locale }));
vi.mock("@/i18n/server", async () => {
  const { dictionary: words } = await import("@/i18n");
  return {
    getT: async (feature: "legal") => words(state.locale, feature),
    getLocale: async () => state.locale,
  };
});

import { LegalPage } from "./legal-page";

describe("the legal pages", () => {
  it.each(locales.flatMap((locale) => (["privacy", "terms"] as const).map((doc) => [locale, doc])))(
    "read in %s: the %s page has its title, every section, and a way to ask",
    async (locale, document) => {
      state.locale = locale as Locale;
      const t = dictionary(locale as Locale, "legal");
      const page = t[document as "privacy" | "terms"];
      render(await LegalPage({ document: document as "privacy" | "terms" }));
      expect(screen.getByRole("heading", { level: 1, name: page.title })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(page.sections.length);
      expect(screen.getByRole("link", { name: t.contactLink })).toHaveAttribute("href", "/contact");
    },
  );
});
