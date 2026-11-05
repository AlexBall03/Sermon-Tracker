import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/client";

const state = vi.hoisted(() => ({
  createOutline: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("../actions", () => ({ createOutline: state.createOutline }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));

import { CreateOutlineButton } from "./create-outline-button";

/*
 * A new outline whose account default cannot be read (A4.2C): nothing is made
 * until the person chooses Balanced, which sends the same outline ID.
 */

const sermonId = "22222222-2222-4222-8222-222222222222";
const unreadable = {
  ok: false,
  code: "default_unreadable",
  message: "Your default preset can't be read, so the outline wasn't created.",
};

function show() {
  render(
    <I18nProvider locale="en">
      <CreateOutlineButton sermonId={sermonId} />
    </I18nProvider>,
  );
}

describe("creating with an unreadable default", () => {
  it("asks, then creates with Balanced under the same outline ID", async () => {
    state.createOutline.mockReset().mockResolvedValueOnce(unreadable).mockResolvedValueOnce({
      ok: true,
      message: "Outline created.",
      outlineId: "33333333-3333-4333-8333-333333333333",
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Create outline" }));
    const asking = await screen.findByRole("alertdialog", {
      name: "Your default preset can't be read",
    });
    expect(within(asking).getByText(/Your default setting stays as it is/)).toBeInTheDocument();
    fireEvent.click(within(asking).getByRole("button", { name: "Create with Balanced" }));
    await waitFor(() => expect(state.createOutline).toHaveBeenCalledTimes(2));
    const [[sermon, id, first], [again, sameId, second]] = state.createOutline.mock.calls;
    expect([sermon, again]).toEqual([sermonId, sermonId]);
    expect(sameId).toBe(id);
    expect(first).toBeUndefined();
    expect(second).toEqual({ appearance: "balanced" });
    await waitFor(() => expect(state.replace).toHaveBeenCalled());
  });

  it("creates nothing when the person cancels", async () => {
    state.createOutline.mockReset().mockResolvedValueOnce(unreadable);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Create outline" }));
    const asking = await screen.findByRole("alertdialog");
    fireEvent.click(within(asking).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(state.createOutline).toHaveBeenCalledTimes(1);
  });
});
