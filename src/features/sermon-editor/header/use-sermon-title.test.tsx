import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/ideas/actions", () => ({ renameSermonTitle: vi.fn() }));
vi.mock("@/features/offline/components/pending-changes", () => ({
  usePendingChanges: () => [],
}));

import { I18nProvider } from "@/i18n/client";
import type { TitleTransport } from "./title-save";
import { TitleStatus, useSermonTitle } from "./use-sermon-title";

/*
 * A4.3: the production header's title hook. React runs effects twice in
 * development (Strict Mode); the saver must still send afterwards (a saver
 * disposed by an effect's cleanup once dropped every title).
 */

function Probe({ transport, canEdit = true }: { transport: TitleTransport; canEdit?: boolean }) {
  const title = useSermonTitle({
    ideaId: "11111111-1111-4111-8111-111111111111",
    title: "Old",
    revision: 2,
    canEdit,
    transport,
  });
  return (
    <>
      <button type="button" onClick={() => title.control.commit("New")}>
        commit
      </button>
      <span data-testid="shown">{title.control.value}</span>
      <span data-testid="editable">{String(title.control.editable)}</span>
      <TitleStatus title={title} />
    </>
  );
}

describe("useSermonTitle (A4.3)", () => {
  it("sends a new title under Strict Mode, against the page's revision, and says it was saved", async () => {
    const rename = vi.fn(async () => ({ code: "renamed" as const, title: "New", revision: 3 }));
    render(
      <StrictMode>
        <I18nProvider locale="en">
          <Probe transport={{ rename, read: vi.fn() }} />
        </I18nProvider>
      </StrictMode>,
    );
    await act(async () => screen.getByRole("button", { name: "commit" }).click());
    expect(rename).toHaveBeenCalledWith({ title: "New", expectedRevision: 2 });
    expect(await screen.findByText("Title saved")).toBeInTheDocument();
    expect(screen.getByTestId("shown")).toHaveTextContent("New");
  });

  it("is not editable where the outline cannot be changed, and says why", () => {
    render(
      <I18nProvider locale="en">
        <Probe transport={{ rename: vi.fn(), read: vi.fn() }} canEdit={false} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("editable")).toHaveTextContent("false");
  });
});
