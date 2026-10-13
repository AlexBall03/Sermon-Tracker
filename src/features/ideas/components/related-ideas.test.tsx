import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/i18n/locales";
import type { IdeaMatch } from "../idea-search";
import type { RelatedIdea } from "../relations";

// The server actions are mocked and the search endpoint is faked: this covers
// what the section and its dialog do around them. Both are tested on a database of their own.
const state = vi.hoisted(() => ({
  relateIdeas: vi.fn(),
  unrelateIdeas: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../relation-actions", () => ({
  relateIdeas: state.relateIdeas,
  unrelateIdeas: state.unrelateIdeas,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/client";
import { RelatedIdeas } from "./related-ideas";

const related = (title: string, fields: Partial<RelatedIdea> = {}): RelatedIdea => ({
  id: `id-${title}`,
  title,
  kind: "sermon",
  status: "idea",
  archivedAt: null,
  ...fields,
});
const match = (title: string, fields: Partial<IdeaMatch> = {}): IdeaMatch => ({
  id: `id-${title}`,
  title,
  kind: "sermon",
  status: "idea",
  subject: null,
  references: [],
  archived: false,
  ...fields,
});

const grace = { id: "id-Grace", title: "Grace", kind: "sermon" as const };
const requests: string[] = [];
let library: IdeaMatch[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  requests.length = 0;
  library = [
    match("Grace"),
    match("Faith", { status: "developing" }),
    match("Hope", { archived: true }),
    match("Faith speaks first", { kind: "point" }),
  ];
  state.relateIdeas.mockResolvedValue({ ok: true, message: "Added to related ideas." });
  state.unrelateIdeas.mockResolvedValue({
    ok: true,
    message: "Removed from related ideas. Both ideas are kept.",
  });
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    const q = (params.get("q") ?? "").toLowerCase();
    const items = library.filter(
      (item) => item.title.toLowerCase().includes(q) && item.kind === params.get("kind"),
    );
    return { ok: true, status: 200, json: async () => ({ items, total: items.length }) };
  });
});

afterEach(() => vi.unstubAllGlobals());

function show(
  props: Partial<React.ComponentProps<typeof RelatedIdeas>> = {},
  locale: Locale = "en",
) {
  return render(
    <I18nProvider locale={locale}>
      <ToastProvider>
        <RelatedIdeas idea={grace} sermons={[]} points={[]} {...props} />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("RelatedIdeas", () => {
  it("lists a sermon's related sermons and points, each with its status and a way to it", () => {
    show({
      sermons: [
        related("Faith", { status: "developing" }),
        related("Hope", { archivedAt: new Date() }),
      ],
      points: [related("Faith speaks first", { kind: "point", status: "ready" })],
      from: "q=grace&page=2",
    });
    expect(screen.getByRole("heading", { name: "Related Ideas" })).toBeVisible();

    const sermons = within(screen.getByRole("list", { name: "Related Sermons" }));
    expect(sermons.getAllByRole("listitem")).toHaveLength(2);
    const [faith, hope] = sermons.getAllByRole("listitem");
    expect(faith).toHaveTextContent("Developing");
    expect(faith).not.toHaveTextContent("Archived");
    // An archived sermon is still related, and says what it is.
    expect(hope).toHaveTextContent("Archived");
    // The way back to the library goes with the link.
    expect(sermons.getByRole("link", { name: "Faith" })).toHaveAttribute(
      "href",
      `/library/id-Faith?${new URLSearchParams({ from: "q=grace&page=2" })}`,
    );

    const points = within(screen.getByRole("list", { name: "Related Points" }));
    expect(points.getByRole("link", { name: "Faith speaks first" })).toHaveAttribute(
      "href",
      expect.stringContaining("/library/id-Faith speaks first"),
    );
    expect(points.getByRole("listitem")).toHaveTextContent("Ready");
  });

  it("says so when there are none, and links plainly with no library to return to", () => {
    const { unmount } = show();
    expect(screen.getByText("No related sermons yet.")).toBeVisible();
    expect(screen.getByText("No related points yet.")).toBeVisible();
    unmount();
    show({ sermons: [related("Faith")] });
    expect(screen.getByRole("link", { name: "Faith" })).toHaveAttribute(
      "href",
      "/library/id-Faith",
    );
  });

  it("shows a point only the sermons it is related to", () => {
    show({ idea: { id: "id-P", title: "A point", kind: "point" } });
    expect(screen.getByText("This point is not related to any sermon yet.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Related Points" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add point" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add sermon" })).toBeVisible();
  });

  it("removes a relation at once, without asking, and reads the page again", async () => {
    show({ sermons: [related("Faith"), related("Hope")] });
    fireEvent.click(screen.getByRole("button", { name: "Remove Faith from related ideas" }));
    // Gone before the server has answered.
    expect(screen.queryByRole("link", { name: "Faith" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hope" })).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(state.unrelateIdeas).toHaveBeenCalledWith("id-Grace", "id-Faith");
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Removed from related ideas. Both ideas are kept.")).toBeVisible();
  });

  it("puts the row back and says why when a removal is refused or never arrives", async () => {
    state.unrelateIdeas.mockResolvedValueOnce({
      ok: false,
      message: "That could not be removed from related ideas. Try again.",
    });
    show({ sermons: [related("Faith")] });
    fireEvent.click(screen.getByRole("button", { name: "Remove Faith from related ideas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That could not be removed from related ideas. Try again.",
    );
    expect(screen.getByRole("link", { name: "Faith" })).toBeVisible();
    expect(state.refresh).not.toHaveBeenCalled();

    state.unrelateIdeas.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Faith from related ideas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not reach the server. Check your connection and try again.",
    );
    expect(screen.getByRole("link", { name: "Faith" })).toBeVisible();
  });

  it("finds a sermon to relate, archived ones included, and never offers one twice", async () => {
    show({ sermons: [related("Faith")] });
    fireEvent.click(screen.getByRole("button", { name: "Add sermon" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add a related sermon" }));
    const list = within(await dialog.findByRole("list", { name: "Recently changed ideas" }));
    // Sermons only, archived ones too.
    expect(requests).toEqual(["/api/ideas/search?kind=sermon&archived=all"]);

    // The sermon on the page is not offered to itself.
    expect(list.queryByText("Grace")).not.toBeInTheDocument();
    // One related already is shown as such and cannot be chosen.
    expect(list.getByRole("button", { name: "Faith: already related" })).toBeDisabled();
    const hope = list.getByRole("button", { name: "Relate Hope" });
    expect(hope).toHaveTextContent("Archived");

    fireEvent.click(hope);
    await waitFor(() => expect(state.relateIdeas).toHaveBeenCalledWith("id-Grace", "id-Hope"));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
    // It stays open, and what was just related cannot be related again.
    expect(await list.findByRole("button", { name: "Hope: already related" })).toBeDisabled();
    expect(state.relateIdeas).toHaveBeenCalledTimes(1);
  });

  it("finds a point by typing, and says when nothing matches", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add point" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add a related point" }));
    expect(await dialog.findByRole("button", { name: "Relate Faith speaks first" })).toBeVisible();

    fireEvent.change(dialog.getByRole("searchbox", { name: "Find a point idea" }), {
      target: { value: "zebra" },
    });
    expect(await dialog.findByText("No point ideas match “zebra”.")).toBeVisible();
    expect(requests.at(-1)).toBe("/api/ideas/search?q=zebra&kind=point&archived=all");
  });

  it("keeps the dialog open and says why when relating is refused", async () => {
    state.relateIdeas.mockResolvedValueOnce({
      ok: false,
      message: "That idea no longer exists.",
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add sermon" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add a related sermon" }));
    fireEvent.click(await dialog.findByRole("button", { name: "Relate Faith" }));
    expect(await dialog.findByText("That idea no longer exists.")).toBeVisible();
    expect(dialog.getByRole("button", { name: "Relate Faith" })).toBeEnabled();
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("is in Spanish for an account that reads Spanish", async () => {
    show({ sermons: [related("Fe", { status: "on_hold", archivedAt: new Date() })] }, "es");
    expect(screen.getByRole("heading", { name: "Ideas relacionadas" })).toBeVisible();
    const sermons = screen.getByRole("list", { name: "Sermones relacionados" });
    expect(sermons).toHaveTextContent("En pausa");
    expect(sermons).toHaveTextContent("Archivada");
    expect(screen.getByText("Todavía no hay puntos relacionados.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Quitar Fe de las ideas relacionadas" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Agregar punto" }));
    expect(
      await screen.findByRole("dialog", { name: "Agregar un punto relacionado" }),
    ).toBeVisible();
  });
});
