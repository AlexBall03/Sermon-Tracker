import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";

vi.mock("../actions", () => {
  const unused = () => {
    throw new Error("not reached in these tests");
  };
  return Object.fromEntries(
    [
      "createAppearancePreset",
      "deleteAppearancePreset",
      "duplicateAppearancePreset",
      "getAppearanceDefault",
      "getAppearancePreset",
      "listAppearancePresets",
      "renameAppearancePreset",
      "replaceAppearancePresetAppearance",
      "setAppearanceDefault",
    ].map((name) => [name, unused]),
  );
});

import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { MyPresets } from "./my-presets";
import type { PresetLibrary } from "./preset-library";

/*
 * Settings → Appearance → My presets (A4.2C): the default for new outlines,
 * the list, and every change sent once, with a lost answer read back.
 */

const id = "11111111-1111-4111-8111-111111111111";
const meta = (revision = 1, name = "Sunday") => ({
  id,
  name,
  revision,
  basePreset: "expressive" as const,
  createdAt: new Date("2026-11-01"),
  updatedAt: new Date("2026-11-02"),
});
const snapshot: AppearanceSnapshot = {
  version: 1,
  preset: "expressive",
  presetRevision: 2,
  numbering: { version: 1, preset: "decimal" },
};
const page = (items = [meta()]) => ({ items, total: items.length, page: 1, pageSize: 25 });
const balanced = { target: { kind: "builtin" as const, preset: "balanced" as const }, revision: 1 };

function library(overrides: Partial<PresetLibrary> = {}): PresetLibrary {
  return {
    list: vi.fn(async () => ({ ok: true, message: "", page: page() })),
    get: vi.fn(async () => ({ ok: true, message: "", preset: meta(), appearance: snapshot })),
    create: vi.fn(),
    duplicate: vi.fn(async () => ({
      ok: true,
      message: "",
      id: "x",
      preset: meta(1, "Copy"),
      replayed: false,
    })),
    rename: vi.fn(async () => ({ ok: true, message: "", preset: meta(2, "Evening") })),
    replace: vi.fn(),
    remove: vi.fn(async () => ({ ok: true, message: "", defaultReset: false, defaultRevision: 1 })),
    getDefault: vi.fn(async () => ({ ok: true, message: "", default: balanced })),
    setDefault: vi.fn(async (input: { target: unknown }) => ({
      ok: true,
      message: "",
      default: { target: input.target, revision: 2 },
    })),
    ...overrides,
  } as PresetLibrary;
}

function show(presets: PresetLibrary, initialDefault = balanced, items = [meta()]) {
  return render(
    <I18nProvider locale="en">
      <MyPresets
        initialPage={page(items)}
        initialDefault={initialDefault as never}
        defaultName={null}
        library={presets}
      />
    </I18nProvider>,
  );
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Actions for Sunday" }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("My presets", () => {
  it("shows the empty state, and the way to make a preset", () => {
    show(library(), balanced, []);
    expect(screen.getByText("No presets yet")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
  });

  it("lists each preset with its base, its date, and a Default badge in words", () => {
    show(library(), { target: { kind: "personal", presetId: id }, revision: 2 } as never);
    const row = document.querySelector<HTMLElement>('li[data-preset-name="Sunday"]')!;
    expect(within(row).getByText("Default")).toBeInTheDocument();
    expect(within(row).getByText(/Based on Expressive/)).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: /Sunday/ })[0]).toBeChecked();
  });

  it("chooses the default against its revision, and takes the current one on a conflict", async () => {
    const setDefault = vi.fn(async () => ({
      ok: false,
      code: "conflict",
      message: "Your default appearance was changed somewhere else.",
      default: { target: { kind: "builtin", preset: "expressive" }, revision: 5 },
    }));
    show(library({ setDefault: setDefault as never }));
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    await waitFor(() =>
      expect(setDefault).toHaveBeenCalledWith({
        target: { kind: "builtin", preset: "minimal" },
        expectedRevision: 1,
      }),
    );
    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Expressive/ })).toBeChecked();
  });

  it("never claims a default change it cannot prove", async () => {
    const getDefault = vi.fn(async () => ({ ok: true, message: "", default: balanced }));
    show(
      library({
        setDefault: (() => Promise.reject(new TypeError("Failed to fetch"))) as never,
        getDefault: getDefault as never,
      }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    expect(await screen.findByText("That change wasn't saved. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renames at the revision it was shown, and reads back a lost answer", async () => {
    const rename = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const get = vi.fn(async () => ({
      ok: true,
      message: "",
      preset: meta(2, "Evening"),
      appearance: snapshot,
    }));
    const presets = library({ rename: rename as never, get: get as never });
    show(presets);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Name" });
    fireEvent.change(field, { target: { value: "Evening" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({ id, expectedRevision: 1, name: "Evening" }),
    );
    expect(
      await screen.findByText(/The change was saved, though its answer was lost/),
    ).toBeInTheDocument();
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it("duplicates with one operation ID, and Try again resends that same request", async () => {
    let calls = 0;
    const duplicate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return { ok: true, message: "", id: "x", preset: meta(1, "Copy of Sunday"), replayed: true };
    });
    show(library({ duplicate: duplicate as never }));
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Copy of Sunday");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(duplicate).toHaveBeenCalledTimes(2));
    const [[first], [second]] = duplicate.mock.calls as unknown as [
      [{ operationId: string }],
      [{ operationId: string }],
    ];
    expect(second).toBe(first);
    expect(first).toMatchObject({ sourceId: id, name: "Copy of Sunday" });
  });

  it("asks before deleting, and says the default goes back to Balanced when it is the default", async () => {
    const remove = vi.fn(async () => ({
      ok: true,
      message: "",
      defaultReset: true,
      defaultRevision: 3,
    }));
    show(
      library({
        remove: remove as never,
        list: vi.fn(async () => ({ ok: true, message: "", page: page([]) })) as never,
      }),
      {
        target: { kind: "personal", presetId: id },
        revision: 2,
      } as never,
    );
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const asking = await screen.findByRole("alertdialog", { name: "Delete “Sunday”?" });
    expect(within(asking).getByText(/new outlines will start with Balanced/)).toBeInTheDocument();
    expect(within(asking).getByText(/keep their appearance/)).toBeInTheDocument();
    fireEvent.click(within(asking).getByRole("button", { name: "Delete preset" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id, expectedRevision: 1 }));
    expect(
      await screen.findByText("Preset deleted. Your default appearance is now Balanced."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
  });

  it("loads a preview only when asked, and only one", async () => {
    const presets = library();
    show(presets);
    expect(presets.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(presets.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByTestId("appearance-preview")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByTestId("appearance-preview")).toBeNull();
  });

  it("says when it is offline and offers no change", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    show(library());
    expect(
      screen.getByText("You're offline. Presets need a connection to change."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Minimal/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actions for Sunday" })).toBeDisabled();
  });

  it("speaks Spanish, and shows a preset's name as written", () => {
    render(
      <I18nProvider locale="es">
        <MyPresets
          initialPage={page([meta(1, "Domingo AM")])}
          initialDefault={balanced}
          defaultName={null}
          library={library()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Predeterminado para bosquejos nuevos")).toBeInTheDocument();
    expect(document.querySelector('li[data-preset-name="Domingo AM"]')).toHaveTextContent(
      "Domingo AM",
    );
    expect(screen.getByRole("radio", { name: /Equilibrada/ })).toBeChecked();
  });
});
