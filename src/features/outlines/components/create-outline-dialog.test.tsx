import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The two server actions and the router are mocked, and the idea search is
// faked: this covers what choosing a sermon does, and that nothing is made by
// opening or leaving.
const state = vi.hoisted(() => ({
  createOutline: vi.fn(),
  createIdea: vi.fn(),
  push: vi.fn(),
}));
vi.mock("../actions", () => ({ createOutline: state.createOutline }));
vi.mock("@/features/ideas/actions", () => ({ createIdea: state.createIdea }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import { ToastProvider } from "@/components/ui/toast";
import { CaptureButton, QuickCaptureProvider } from "@/features/ideas/components/quick-capture";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import {
  CreateOutlineAction,
  OutlinesProvider,
} from "@/features/outlines/components/outlines-state";
import { defaultOutlinesQuery } from "../outlines-query";

const grace = "11111111-1111-4111-8111-111111111111";
const peace = "22222222-2222-4222-8222-222222222222";
const peaceOutline = "33333333-3333-4333-8333-333333333333";
const made = "44444444-4444-4444-8444-444444444444";

const match = (id: string, title: string, outlineId: string | null) => ({
  id,
  title,
  kind: "sermon",
  status: "developing",
  subject: null,
  references: [],
  archived: false,
  outlineId,
});

let requests: string[];
let matches: ReturnType<typeof match>[];

function open(locale: Locale = "en") {
  render(
    <I18nProvider locale={locale}>
      <ToastProvider>
        <QuickCaptureProvider>
          <OutlinesProvider query={defaultOutlinesQuery}>
            <CreateOutlineAction />
          </OutlinesProvider>
          <CaptureButton />
        </QuickCaptureProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

const press = () =>
  fireEvent.click(screen.getByRole("button", { name: /^(Create Outline|Crear bosquejo)$/ }));

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  matches = [match(grace, "Grace", null), match(peace, "Peace", peaceOutline)];
  vi.stubGlobal("fetch", async (address: string) => {
    requests.push(address);
    return { ok: true, status: 200, json: async () => ({ items: matches, total: matches.length }) };
  });
  state.createOutline.mockResolvedValue({ ok: true, message: "Outline created.", outlineId: made });
  state.createIdea.mockResolvedValue({ ok: true, message: "Saved to your library.", id: grace });
});

describe("creating an outline from the overview", () => {
  it("offers the account's active sermons, and says which has an outline", async () => {
    open();
    press();
    const dialog = await screen.findByRole("dialog", { name: "Create an outline" });
    expect(
      await within(dialog).findByRole("button", { name: "Grace: create its outline" }),
    ).toBeVisible();
    const taken = within(dialog).getByRole("button", { name: "Peace: open its outline" });
    expect(taken).toHaveTextContent("Has an outline");
    // Sermons only, each with its outline, and never an archived one.
    expect(requests).toEqual(["/api/ideas/search?kind=sermon&outline=1"]);
    // Opening it has made nothing.
    expect(state.createOutline).not.toHaveBeenCalled();
  });

  it("makes nothing when it is opened and closed", async () => {
    open();
    press();
    const dialog = await screen.findByRole("dialog", { name: "Create an outline" });
    await within(dialog).findByRole("button", { name: "Grace: create its outline" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state.createOutline).not.toHaveBeenCalled();
    expect(state.createIdea).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });

  it("opens the outline a sermon already has, and makes no second", async () => {
    open();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Peace: open its outline" }));
    expect(state.push).toHaveBeenCalledWith(`/outlines/${peaceOutline}`);
    expect(state.createOutline).not.toHaveBeenCalled();
  });

  it("gives a sermon without one its outline, once, and opens it", async () => {
    open();
    press();
    const choice = await screen.findByRole("button", { name: "Grace: create its outline" });
    fireEvent.click(choice);
    // Pressed again before the answer: still one request.
    fireEvent.click(choice);
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/outlines/${made}`));
    expect(state.createOutline).toHaveBeenCalledTimes(1);
    const [sermonId, outlineId] = state.createOutline.mock.calls[0];
    expect(sermonId).toBe(grace);
    // The outline's ID is made in the browser, so a retry cannot make two.
    expect(outlineId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("opens the outline made a moment ago somewhere else, when the server says there is one", async () => {
    state.createOutline.mockResolvedValue({
      ok: false,
      code: "exists",
      message: "This sermon already has an outline.",
      outlineId: peaceOutline,
    });
    open();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Grace: create its outline" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/outlines/${peaceOutline}`));
  });

  it("says why when the outline could not be made, stays open, and tries again with the same ID", async () => {
    state.createOutline.mockResolvedValueOnce({
      ok: false,
      code: "failed",
      message: "The outline could not be created. Try again.",
    });
    open();
    press();
    const choice = await screen.findByRole("button", { name: "Grace: create its outline" });
    fireEvent.click(choice);
    expect(await screen.findByText("The outline could not be created. Try again.")).toBeVisible();
    expect(state.push).not.toHaveBeenCalled();

    fireEvent.click(choice);
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/outlines/${made}`));
    expect(state.createOutline.mock.calls[1]).toEqual(state.createOutline.mock.calls[0]);
  });

  it("says so when the request never reaches the server", async () => {
    state.createOutline.mockRejectedValueOnce(new Error("network"));
    open();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "Grace: create its outline" }));
    expect(await screen.findByText(/did not reach the server/)).toBeVisible();
  });

  it("says when a search finds no sermon, and when there are none at all", async () => {
    matches = [];
    open();
    press();
    expect(await screen.findByText(/You have no sermon ideas yet/)).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a sermon" }), {
      target: { value: "nothing" },
    });
    // Typing waits for a pause, then asks for that word among sermons.
    await waitFor(() =>
      expect(requests.at(-1)).toBe("/api/ideas/search?q=nothing&kind=sermon&outline=1"),
    );
    expect(await screen.findByText("No sermon ideas match “nothing”.")).toBeVisible();
  });
});

describe("outlining a sermon that is not captured yet", () => {
  async function begin() {
    open();
    press();
    fireEvent.click(await screen.findByRole("button", { name: "New sermon idea" }));
    return screen.findByRole("dialog", { name: "Capture an idea" });
  }

  it("hands over to quick capture, already a sermon, and makes nothing by doing so", async () => {
    const capture = await begin();
    expect(within(capture).getByRole("radio", { name: "Sermon" })).toBeChecked();
    expect(state.createIdea).not.toHaveBeenCalled();
    expect(state.createOutline).not.toHaveBeenCalled();
  });

  it("makes no sermon and no outline when the capture is abandoned", async () => {
    const capture = await begin();
    fireEvent.click(within(capture).getByRole("button", { name: "Close capture" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Capture an idea" })).not.toBeInTheDocument(),
    );
    expect(state.createIdea).not.toHaveBeenCalled();
    expect(state.createOutline).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });

  it("saves the sermon first, then makes its outline and opens it", async () => {
    const capture = await begin();
    const title = within(capture).getByRole("textbox", { name: "Idea" });
    fireEvent.change(title, { target: { value: "Grace" } });
    fireEvent.submit(title.closest("form")!);
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/outlines/${made}`));
    expect(state.createIdea).toHaveBeenCalledTimes(1);
    expect(state.createIdea.mock.calls[0][0]).toMatchObject({ kind: "sermon", title: "Grace" });
    // The outline is of the sermon that was just saved, and is asked for only after it.
    expect(state.createOutline.mock.calls[0][0]).toBe(grace);
    expect(state.createIdea.mock.invocationCallOrder[0]).toBeLessThan(
      state.createOutline.mock.invocationCallOrder[0],
    );
  });

  it("makes no outline when the sermon could not be saved", async () => {
    state.createIdea.mockResolvedValue({ ok: false, message: "Your idea could not be saved." });
    const capture = await begin();
    const title = within(capture).getByRole("textbox", { name: "Idea" });
    fireEvent.change(title, { target: { value: "Grace" } });
    fireEvent.submit(title.closest("form")!);
    expect(await screen.findByText("Your idea could not be saved.")).toBeVisible();
    expect(state.createOutline).not.toHaveBeenCalled();
  });

  it("makes no outline for an idea saved as something other than a sermon, and says so", async () => {
    const capture = await begin();
    fireEvent.click(within(capture).getByRole("radio", { name: "Point" }));
    const title = within(capture).getByRole("textbox", { name: "Idea" });
    fireEvent.change(title, { target: { value: "A point after all" } });
    fireEvent.submit(title.closest("form")!);
    expect(await screen.findByText(/Only a sermon can have an outline/)).toBeVisible();
    expect(state.createOutline).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });

  it("does not carry the outline over to an ordinary capture made afterwards", async () => {
    const capture = await begin();
    fireEvent.click(within(capture).getByRole("button", { name: "Close capture" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Capture an idea" })).not.toBeInTheDocument(),
    );
    // Quick capture opened by itself afterwards, as from the bar: a sermon saved there is only saved.
    fireEvent.click(screen.getByRole("button", { name: "Capture an idea" }));
    const again = await screen.findByRole("dialog", { name: "Capture an idea" });
    fireEvent.click(within(again).getByRole("radio", { name: "Sermon" }));
    const title = within(again).getByRole("textbox", { name: "Idea" });
    fireEvent.change(title, { target: { value: "Just a sermon" } });
    fireEvent.submit(title.closest("form")!);
    expect(await screen.findByText("Saved to your library.")).toBeVisible();
    expect(state.createOutline).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });
});

describe("in Spanish", () => {
  it("says everything in Spanish", async () => {
    open("es");
    press();
    const dialog = await screen.findByRole("dialog", { name: "Crear un bosquejo" });
    expect(
      await within(dialog).findByRole("button", { name: "Peace: abrir su bosquejo" }),
    ).toHaveTextContent("Tiene bosquejo");
    expect(within(dialog).getByRole("button", { name: "Nueva idea de sermón" })).toBeVisible();
  });
});
