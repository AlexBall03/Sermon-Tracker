import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import type { HistoryItem } from "../occurrences";

// The server actions and the router are mocked: this covers the section's own behavior.
vi.mock("../actions", () => ({
  recordOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  createVenue: vi.fn(),
  createContext: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { SermonHistory } from "./sermon-history";

const sermon = { id: "11111111-1111-4111-8111-111111111111", title: "It is Well" };

const occasion = (index: number, fields: Partial<HistoryItem> = {}): HistoryItem => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${index}`,
  ownerId: "owner-1",
  sermonId: sermon.id,
  preachedOn: `2026-10-0${5 - index}`,
  timeOfDay: index === 1 ? "pm" : null,
  venueId: null,
  contextId: null,
  actualFormat: "unspecified",
  durationMinutes: null,
  notes: null,
  recordingUrl: null,
  createdAt: new Date("2026-10-04T18:00:00Z"),
  updatedAt: new Date("2026-10-04T18:00:00Z"),
  sermon: { ...sermon, kind: "sermon", archivedAt: null },
  venue: index === 1 ? { id: "v", name: "Grace Baptist Church", locality: "Springfield" } : null,
  context: null,
  ...fields,
});

function show(props: Partial<Parameters<typeof SermonHistory>[0]> = {}, locale: Locale = "en") {
  return render(
    <I18nProvider locale={locale}>
      <ToastProvider>
        <SermonHistory
          sermon={sermon}
          recordable
          recent={[]}
          total={0}
          venues={[]}
          contexts={[]}
          {...props}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}
const section = () => within(screen.getByRole("region", { name: "Preaching record" }));

beforeEach(() => vi.clearAllMocks());

describe("a sermon's own preaching history", () => {
  it("says a sermon has not been preached, and offers to record it", async () => {
    show();
    expect(section().getByText("Not recorded as preached yet.")).toBeVisible();
    expect(section().queryByRole("list")).not.toBeInTheDocument();

    fireEvent.click(section().getByRole("button", { name: "Record preaching" }));
    // For this sermon: it is named, and there is no other to choose.
    const dialog = await screen.findByRole("dialog", { name: "Record preaching" });
    expect(dialog).toHaveTextContent("It is Well");
    expect(within(dialog).queryByRole("search")).not.toBeInTheDocument();
  });

  it("says how often and when last, and lists the latest occasions", () => {
    show({ recent: [occasion(1), occasion(2), occasion(3)], total: 7 });
    expect(section().getByText("Preached 7 times, most recently on Oct 4, 2026.")).toBeVisible();

    const rows = within(section().getByRole("list", { name: "Recent preaching" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Oct 4, 2026");
    expect(rows[0]).toHaveTextContent("PM");
    expect(rows[0]).toHaveTextContent("Grace Baptist Church, Springfield");
    // Every row is this sermon, so none repeats its name.
    expect(rows[1].textContent).toBe("Oct 3, 2026");

    // The rest are in the library's history, narrowed to this sermon.
    expect(section().getByRole("link", { name: "View all 7" })).toHaveAttribute(
      "href",
      `/library/preaching-record?sermon=${sermon.id}`,
    );
  });

  it("needs no way to the rest when everything is already listed", () => {
    show({ recent: [occasion(1)], total: 1 });
    expect(section().getByText("Preached once, on Oct 4, 2026.")).toBeVisible();
    expect(section().queryByRole("link", { name: /View all/ })).not.toBeInTheDocument();
  });

  it("opens an occasion to read, change, or remove, without a link back to this page", async () => {
    show({ recent: [occasion(1)], total: 1 });
    fireEvent.click(
      section().getByRole("button", { name: /View It is Well, preached Oct 4, 2026 PM/ }),
    );
    const dialog = within(await screen.findByRole("dialog", { name: "Record details" }));
    expect(dialog.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(dialog.getByRole("button", { name: "Delete record" })).toBeVisible();
    expect(dialog.queryByRole("link", { name: "Open sermon" })).not.toBeInTheDocument();
  });

  it("keeps the history of an idea no longer filed as a sermon, and records nothing new on it", async () => {
    show({
      recordable: false,
      recent: [occasion(1, { sermon: { ...sermon, kind: "point", archivedAt: null } })],
      total: 1,
    });
    expect(section().queryByRole("button", { name: "Record preaching" })).not.toBeInTheDocument();
    expect(
      section().getByText(
        "This idea is not filed as a sermon now, so new preaching cannot be recorded. Its record is kept.",
      ),
    ).toBeVisible();
    // What was recorded can still be read and corrected.
    fireEvent.click(section().getByRole("button", { name: /View It is Well/ }));
    expect(
      within(await screen.findByRole("dialog", { name: "Record details" })).getByRole("button", {
        name: "Edit",
      }),
    ).toBeVisible();
  });

  it("is in Spanish for an account that reads Spanish", () => {
    show({ recent: [occasion(1), occasion(2)], total: 12 }, "es");
    const spanish = within(screen.getByRole("region", { name: "Registro de predicación" }));
    expect(spanish.getByText("Predicado 12 veces, la más reciente el 4 oct 2026.")).toBeVisible();
    expect(spanish.getByRole("button", { name: "Registrar predicación" })).toBeVisible();
    expect(spanish.getByRole("link", { name: "Ver las 12" })).toBeVisible();
  });
});
