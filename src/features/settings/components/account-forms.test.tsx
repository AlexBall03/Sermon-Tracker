import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountUser } from "../hooks/use-account-action";

/**
 * Clerk is mocked throughout: the user object below is a stand-in, and
 * reverification is a pass-through. These tests cover our forms' validation,
 * the calls they make, and what they show; they do not verify Clerk.
 */
const state = vi.hoisted(() => ({ updateProfileName: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  useReverification: <T,>(fetcher: T) => fetcher,
  useSession: () => ({ session: { id: "sess_current" } }),
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    typeof error === "object" && error !== null && "errors" in error,
  isReverificationCancelledError: () => false,
}));
vi.mock("../actions", () => ({ updateProfileName: state.updateProfileName }));

import { AvatarField } from "./avatar-field";
import { ConnectedAccounts } from "./connected-accounts";
import { EmailAddresses } from "./email-addresses";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

function emailEntry(id: string, emailAddress: string, status: "verified" | "unverified") {
  return {
    id,
    emailAddress,
    verification: { status },
    prepareVerification: vi.fn(async () => {}),
    attemptVerification: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  };
}

function googleAccount() {
  return {
    id: "eac_1",
    provider: "google",
    providerTitle: () => "Google",
    emailAddress: "ada@gmail.com",
    verification: { status: "verified" },
    destroy: vi.fn(async () => {}),
  };
}

function fakeUser(overrides: Record<string, unknown> = {}) {
  const user = {
    id: "user_1",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    hasImage: false,
    imageUrl: "",
    passwordEnabled: true,
    primaryEmailAddressId: "em_1",
    primaryEmailAddress: { emailAddress: "ada@example.com" },
    emailAddresses: [emailEntry("em_1", "ada@example.com", "verified")],
    externalAccounts: [] as unknown[],
    reload: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    setProfileImage: vi.fn(async () => {}),
    createEmailAddress: vi.fn(),
    createExternalAccount: vi.fn(),
    ...overrides,
  };
  return user as typeof user & AccountUser;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  state.updateProfileName.mockResolvedValue({ ok: true, message: "Your name has been saved." });
});

describe("ProfileForm", () => {
  it("starts from the current name", () => {
    render(<ProfileForm user={fakeUser()} />);
    expect(screen.getByLabelText("First name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Last name")).toHaveValue("Lovelace");
  });

  it("explains a missing first name without saving", () => {
    render(<ProfileForm user={fakeUser()} />);
    type("First name", "  ");
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInvalid();
    expect(state.updateProfileName).not.toHaveBeenCalled();
  });

  it("saves through the server action, then refreshes the identity", async () => {
    const user = fakeUser();
    render(<ProfileForm user={user} />);
    type("First name", " Grace ");
    type("Last name", "Hopper");
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Your name has been saved.")).toBeInTheDocument();
    expect(state.updateProfileName).toHaveBeenCalledWith({
      firstName: "Grace",
      lastName: "Hopper",
    });
    expect(user.reload).toHaveBeenCalled();
  });

  it("shows the server's refusal and does not refresh", async () => {
    state.updateProfileName.mockResolvedValue({
      ok: false,
      message: "Your session has ended. Sign in again.",
    });
    const user = fakeUser();
    render(<ProfileForm user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Your session has ended. Sign in again.")).toBeInTheDocument();
    expect(user.reload).not.toHaveBeenCalled();
  });
});

describe("AvatarField", () => {
  it("refuses a file that is not an image", () => {
    const user = fakeUser();
    render(<AvatarField user={user} />);
    const file = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("avatar-input"), { target: { files: [file] } });
    expect(screen.getByText("Choose a PNG, JPEG, WebP, or GIF image.")).toBeInTheDocument();
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it("uploads an image", async () => {
    const user = fakeUser();
    render(<AvatarField user={user} />);
    const file = new File(["png"], "me.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("avatar-input"), { target: { files: [file] } });
    expect(await screen.findByText("Your picture has been updated.")).toBeInTheDocument();
    expect(user.setProfileImage).toHaveBeenCalledWith({ file });
  });
});

describe("PasswordForm", () => {
  it("asks for the current password when one is set", async () => {
    const user = fakeUser();
    render(<PasswordForm user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    type("New password", "correct horse");
    type("Confirm new password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Enter your current password.")).toBeInTheDocument();
    expect(user.updatePassword).not.toHaveBeenCalled();

    type("Current password", "old password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Your password has been changed.")).toBeInTheDocument();
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: "old password",
      newPassword: "correct horse",
      signOutOfOtherSessions: true,
    });
  });

  it("catches a mismatched confirmation", () => {
    const user = fakeUser();
    render(<PasswordForm user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    type("Current password", "old password");
    type("New password", "correct horse");
    type("Confirm new password", "correct house");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("The two passwords do not match.")).toBeInTheDocument();
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  it("lets an account without a password set one, with no current-password field", async () => {
    const user = fakeUser({ passwordEnabled: false });
    render(<PasswordForm user={user} />);
    expect(screen.getByText(/You have not set a password/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set a password" }));
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();

    type("New password", "correct horse");
    type("Confirm new password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Your password has been set.")).toBeInTheDocument();
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: undefined,
      newPassword: "correct horse",
      signOutOfOtherSessions: true,
    });
  });

  it("reports the provider's refusal in our own words", async () => {
    const user = fakeUser();
    user.updatePassword.mockRejectedValueOnce({
      errors: [{ code: "form_password_incorrect", message: "raw provider text" }],
    });
    render(<PasswordForm user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    type("Current password", "wrong");
    type("New password", "correct horse");
    type("Confirm new password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Your current password is not correct.")).toBeInTheDocument();
    expect(screen.queryByText(/raw provider text/)).not.toBeInTheDocument();
  });
});

describe("EmailAddresses", () => {
  it("marks primary, verified, and unverified addresses", () => {
    const user = fakeUser({
      emailAddresses: [
        emailEntry("em_1", "ada@example.com", "verified"),
        emailEntry("em_2", "second@example.com", "verified"),
        emailEntry("em_3", "new@example.com", "unverified"),
      ],
    });
    render(<EmailAddresses user={user} />);
    const rows = screen.getAllByRole("listitem");

    expect(within(rows[0]).getByText("Primary")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Verified")).toBeInTheDocument();
    // The primary address cannot be removed or demoted from its own row.
    expect(within(rows[0]).queryByRole("button")).not.toBeInTheDocument();

    expect(
      within(rows[1]).getByRole("button", { name: "Make second@example.com your primary address" }),
    ).toBeInTheDocument();
    expect(within(rows[2]).getByText("Unverified")).toBeInTheDocument();
    expect(within(rows[2]).getByRole("button", { name: "Verify new@example.com" })).toBeEnabled();
    expect(within(rows[2]).queryByRole("button", { name: /Make .* primary/ })).toBeNull();
  });

  it("validates a new address before contacting the provider", () => {
    const user = fakeUser();
    render(<EmailAddresses user={user} />);
    type("Add an email address", "not-an-email");
    fireEvent.click(screen.getByRole("button", { name: "Add address" }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();

    type("Add an email address", "ADA@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Add address" }));
    expect(screen.getByText("That address is already on your account.")).toBeInTheDocument();
    expect(user.createEmailAddress).not.toHaveBeenCalled();
  });

  it("adds an address, sends its code, and verifies it with that code", async () => {
    const user = fakeUser();
    const added = emailEntry("em_2", "new@example.com", "unverified");
    added.attemptVerification.mockImplementation(async () => {
      added.verification.status = "verified";
    });
    user.createEmailAddress.mockImplementation(async () => {
      user.emailAddresses.push(added);
      return added;
    });

    render(<EmailAddresses user={user} />);
    type("Add an email address", "new@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Add address" }));

    const code = await screen.findByLabelText("Code sent to new@example.com");
    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "new@example.com" });
    expect(added.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });

    fireEvent.change(code, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify address" }));
    expect(screen.getByText("Enter the 6-digit code from the email.")).toBeInTheDocument();
    expect(added.attemptVerification).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify address" }));
    expect(await screen.findByText("new@example.com is verified.")).toBeInTheDocument();
    expect(added.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
  });

  it("asks before removing an address", async () => {
    const second = emailEntry("em_2", "second@example.com", "verified");
    const user = fakeUser({
      emailAddresses: [emailEntry("em_1", "ada@example.com", "verified"), second],
    });
    render(<EmailAddresses user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove second@example.com" }));
    expect(second.destroy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove address" }));
    await waitFor(() => expect(second.destroy).toHaveBeenCalled());
  });
});

describe("ConnectedAccounts", () => {
  it("offers to connect a provider that is not linked", () => {
    render(<ConnectedAccounts user={fakeUser()} />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Google" })).toBeEnabled();
  });

  it("will not disconnect the only way to sign in", () => {
    const user = fakeUser({ passwordEnabled: false, externalAccounts: [googleAccount()] });
    render(<ConnectedAccounts user={user} />);
    expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeDisabled();
    expect(screen.getByText(/This is your only way to sign in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Google" })).not.toBeInTheDocument();
  });

  it("allows disconnecting when a password is also set, after confirmation", async () => {
    const google = googleAccount();
    const user = fakeUser({ externalAccounts: [google] });
    render(<ConnectedAccounts user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Google" }));
    expect(google.destroy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(google.destroy).toHaveBeenCalled());
  });
});
