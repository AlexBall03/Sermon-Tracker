import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dictionary } from "@/i18n";
import { hasUnsavedWork } from "@/lib/unsaved-work";

const state = vi.hoisted(() => ({
  refresh: vi.fn(),
  setTicketStatus: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh, push: vi.fn() }) }));
vi.mock("../actions", () => ({
  adminReplyToTicket: vi.fn(),
  closeTicket: vi.fn(),
  markTicketRead: vi.fn(),
  markTicketReadByAdmin: vi.fn(),
  replyToTicket: vi.fn(),
  setTicketStatus: state.setTicketStatus,
}));
// Radix's listbox does not open in jsdom; a native select stands in for the choice.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

import { StatusControl } from "./ticket-parts";

const t = dictionary("en", "support");
const choose = (status: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: t.admin.changeStatus }), {
    target: { value: status },
  });
const saveButton = () => screen.getByRole("button", { name: t.admin.saveStatus });

beforeEach(() => {
  vi.clearAllMocks();
  state.setTicketStatus.mockResolvedValue({ ok: true, message: t.admin.statusSaved });
});

describe("StatusControl", () => {
  it("does not save when a status is chosen, only when Save Changes is pressed", async () => {
    render(<StatusControl ticketId="t1" kind="bug" status="open" />);
    expect(saveButton()).toBeDisabled();

    choose("in_progress");
    expect(state.setTicketStatus).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
    expect(hasUnsavedWork()).toBe(true);

    await act(async () => {
      fireEvent.click(saveButton());
      fireEvent.click(saveButton());
    });
    expect(screen.getByText(t.admin.statusSaved)).toBeInTheDocument();
    expect(state.setTicketStatus).toHaveBeenCalledTimes(1);
    expect(state.setTicketStatus).toHaveBeenCalledWith("t1", { status: "in_progress" });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    expect(hasUnsavedWork()).toBe(false);
  });

  it("keeps the chosen status when the save fails", async () => {
    state.setTicketStatus.mockResolvedValue({ ok: false, message: "Refused." });
    render(<StatusControl ticketId="t1" kind="bug" status="open" />);
    choose("in_progress");
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByText("Refused.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("in_progress");
    expect(saveButton()).toBeEnabled();
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("follows a status saved elsewhere unless a choice is unsaved", () => {
    const { rerender } = render(<StatusControl ticketId="t1" kind="bug" status="open" />);
    act(() => rerender(<StatusControl ticketId="t1" kind="bug" status="in_progress" />));
    expect(screen.getByRole("combobox")).toHaveValue("in_progress");
    expect(saveButton()).toBeDisabled();

    choose("open");
    act(() => rerender(<StatusControl ticketId="t1" kind="bug" status="resolved" />));
    expect(screen.getByRole("combobox")).toHaveValue("open");
    expect(saveButton()).toBeEnabled();
  });
});
