import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testPreferences } from "@/features/preferences/testing";

// The access helper, the queries, and the editor are mocked: this covers what the
// two pages decide. The queries are tested on a database, the editor by itself.
const state = vi.hoisted(() => ({
  signedIn: true,
  outline: null as unknown,
  sermonOutline: null as unknown,
  idea: null as unknown,
  getOutline: vi.fn(),
  getOutlineForSermon: vi.fn(),
  getIdea: vi.fn(),
  editor: vi.fn(),
  hasDocument: false,
  conversion: false,
  host: vi.fn(),
  convert: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return { id: "owner-1", clerkUserId: "user_clerk", role: "user", status: "active" };
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/outlines/outlines", () => ({
  getOutline: async (...args: unknown[]) => {
    state.getOutline(...args);
    return state.outline;
  },
  getOutlineSermon: async (...args: unknown[]) => {
    state.getOutline(...args);
    const found = state.outline as { id: string; sermon: unknown } | null;
    return found ? { id: found.id, sermon: found.sermon } : null;
  },
  getOutlineForSermon: async (...args: unknown[]) => {
    state.getOutlineForSermon(...args);
    return state.sermonOutline;
  },
}));
vi.mock("@/features/ideas/ideas", () => ({
  getIdea: async (...args: unknown[]) => {
    state.getIdea(...args);
    return state.idea;
  },
}));
vi.mock("@/features/outlines/actions", () => ({ createOutline: vi.fn() }));
vi.mock("@/features/outlines/components/outline-editor", () => ({
  OutlineEditor: (props: unknown) => {
    state.editor(props);
    return <div data-testid="editor" />;
  },
}));
vi.mock("@/features/sermon-editor/persistence/authority", () => ({
  hasDocument: async () => state.hasDocument,
}));
vi.mock("@/features/sermon-editor/persistence/rollout", () => ({
  conversionEnabled: () => state.conversion,
}));
vi.mock("@/features/sermon-editor/host/outline-document-host", () => ({
  OutlineDocumentHost: (props: unknown) => {
    state.host(props);
    return <div data-testid="document-host" />;
  },
}));
vi.mock("@/features/sermon-editor/host/convert-on-open", () => ({
  ConvertOnOpen: ({ legacy, ...props }: { legacy: React.ReactNode }) => {
    state.convert(props);
    return <div data-testid="convert-on-open">{legacy}</div>;
  },
}));

import OutlinePage from "./[id]/page";
import NewOutlinePage from "./new/page";

const outlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sermonId = "11111111-1111-4111-8111-111111111111";

const sermon = (fields = {}) => ({
  id: sermonId,
  title: "It is Well",
  kind: "sermon",
  archivedAt: null,
  ...fields,
});

const outline = (fields = {}) => ({
  id: outlineId,
  sermonId,
  numbering: { version: 1, preset: "traditional" },
  revision: 4,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  sermon: sermon(),
  entries: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      outlineId,
      parentId: null,
      type: "point",
      position: 0,
      title: "Grace",
      notes: null,
      sourcePointId: null,
      revision: 2,
      references: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      depth: 0,
      path: [1],
    },
  ],
  ...fields,
});

const openEditor = async (id = outlineId) =>
  render(await OutlinePage({ params: Promise.resolve({ id }) }));
const openNew = async (
  query: Record<string, string | string[] | undefined> = { sermon: sermonId },
) => render(await NewOutlinePage({ searchParams: Promise.resolve(query) }));

beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
  state.outline = outline();
  state.sermonOutline = null;
  state.idea = sermon();
  state.hasDocument = false;
  state.conversion = false;
});

describe("the outline editor's page", () => {
  it("sends a signed-out or disabled visitor away before anything is read", async () => {
    state.signedIn = false;
    await expect(openEditor()).rejects.toThrow("redirect:/sign-in");
    expect(state.getOutline).not.toHaveBeenCalled();
  });

  it("is not found for an ID that is not one, without asking the database", async () => {
    for (const id of ["new-outline", "1", "aaaaaaaa-aaaa-4aaa-8aaa", "' or 1=1 --"]) {
      await expect(openEditor(id)).rejects.toThrow("not-found");
    }
    expect(state.getOutline).not.toHaveBeenCalled();
  });

  it("is the same not found for an outline that is missing and one that is someone else's", async () => {
    // The query is the owner's alone: either way it returns nothing.
    state.outline = null;
    await expect(openEditor()).rejects.toThrow("not-found");
    expect(state.getOutline).toHaveBeenCalledWith("database", "owner-1", outlineId);
  });

  it("names the sermon, leads back to it, and hands the editor what it edits and no more", async () => {
    await openEditor(outlineId.toUpperCase());
    expect(state.getOutline).toHaveBeenCalledWith("database", "owner-1", outlineId);
    expect(screen.getByRole("heading", { level: 1, name: "Outline" })).toBeInTheDocument();
    // The sermon is named, and its name leads to it as "back" does.
    expect(screen.getByRole("link", { name: "It is Well" })).toHaveAttribute(
      "href",
      `/library/${sermonId}`,
    );
    expect(screen.getByRole("link", { name: "Back to sermon" })).toHaveAttribute(
      "href",
      `/library/${sermonId}`,
    );
    expect(state.editor).toHaveBeenCalledWith({
      // With what describes it beside a copy kept on the device (Phase 5D.2).
      sermon: { id: sermonId, title: "It is Well", kind: "sermon", archivedAt: null },
      // The sermon's own passages, for the editor to offer on each entry. This sermon has none.
      sermonReferences: [],
      snapshot: {
        id: outlineId,
        revision: 4,
        numbering: { version: 1, preset: "traditional" },
        entries: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            parentId: null,
            type: "point",
            position: 0,
            title: "Grace",
            notes: null,
            revision: 2,
            // Its passages, and the saved point it was made from: both are the editor's to show.
            references: [],
            sourcePointId: null,
          },
        ],
      },
    });
  });

  it("still opens the outline of a sermon that was archived or refiled, and says which", async () => {
    state.outline = outline({ sermon: sermon({ archivedAt: new Date(0) }) });
    const { unmount } = await openEditor();
    expect(screen.getByText(/This sermon is archived/)).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    unmount();

    state.outline = outline({ sermon: sermon({ kind: "point" }) });
    await openEditor();
    expect(screen.getByText(/no longer filed as a sermon/)).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });

  it("reads in Spanish", async () => {
    testPreferences.locale = "es";
    await openEditor();
    expect(screen.getByRole("heading", { level: 1, name: "Bosquejo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al sermón" })).toBeInTheDocument();
  });
});

describe("which editor an outline opens in (A3)", () => {
  const host = {
    owner: "owner-1",
    clerkUserId: "user_clerk",
    outlineId,
    sermon: { id: sermonId, title: "It is Well", kind: "sermon", archivedAt: null },
  };

  it("opens an outline with a sermon document in the sermon editor, whatever the switch says", async () => {
    state.hasDocument = true;
    for (const conversion of [false, true]) {
      state.conversion = conversion;
      const { unmount } = await openEditor();
      expect(screen.getByTestId("document-host")).toBeInTheDocument();
      // Never the legacy editor, and no entries read for it.
      expect(screen.queryByTestId("editor")).toBeNull();
      unmount();
    }
    expect(state.host).toHaveBeenLastCalledWith(host);
    expect(state.getIdea).not.toHaveBeenCalled();
  });

  it("converts a legacy outline once in the browser while conversion is on, with the legacy editor kept for a refusal", async () => {
    state.conversion = true;
    await openEditor();
    expect(state.convert).toHaveBeenCalledWith(host);
    // The legacy editor is what a refused conversion falls back to; it is not a blank document.
    expect(screen.getByTestId("convert-on-open")).toContainElement(screen.getByTestId("editor"));
    expect(state.host).not.toHaveBeenCalled();
  });

  it("opens a legacy outline in the outline editor while conversion is off", async () => {
    await openEditor();
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(state.convert).not.toHaveBeenCalled();
    expect(state.host).not.toHaveBeenCalled();
  });
});

describe("the page a sermon is given an outline on", () => {
  it("sends a signed-out visitor away, and is not found without a sermon that is one", async () => {
    state.signedIn = false;
    await expect(openNew()).rejects.toThrow("redirect:/sign-in");
    state.signedIn = true;
    for (const query of [{}, { sermon: "grace" }, { sermon: [sermonId, sermonId] }]) {
      await expect(openNew(query)).rejects.toThrow("not-found");
    }
    expect(state.getIdea).not.toHaveBeenCalled();
  });

  it("is the same not found for a sermon that is missing and one that is someone else's", async () => {
    state.idea = null;
    await expect(openNew()).rejects.toThrow("not-found");
    expect(state.getIdea).toHaveBeenCalledWith("database", "owner-1", sermonId);
  });

  it("goes straight to the outline a sermon already has", async () => {
    state.sermonOutline = outline();
    await expect(openNew()).rejects.toThrow(`redirect:/outlines/${outlineId}`);
  });

  it("offers to make one for a sermon, and makes nothing by being opened", async () => {
    await openNew();
    expect(screen.getByRole("heading", { level: 1, name: "New outline" })).toBeInTheDocument();
    expect(screen.getByText("It is Well")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create outline" })).toBeEnabled();
  });

  it("does not offer one for an idea that is not a sermon", async () => {
    for (const kind of ["point", "undecided"]) {
      state.idea = sermon({ kind });
      const { unmount } = await openNew();
      expect(
        screen.getByRole("heading", { name: "Only a sermon can have an outline" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create outline" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to the idea" })).toHaveAttribute(
        "href",
        `/library/${sermonId}`,
      );
      unmount();
    }
  });
});
