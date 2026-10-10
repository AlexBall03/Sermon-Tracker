import { isClerkAPIResponseError, isReverificationCancelledError } from "@clerk/nextjs/errors";

/**
 * Sign-in provider error codes mapped to our own wording. Provider text is
 * never shown as it arrives; an unrecognised error gets the caller's fallback.
 */
const messages: Record<string, string> = {
  form_password_incorrect: "Your current password is not correct.",
  form_password_pwned:
    "That password has appeared in a data breach elsewhere. Choose a different one.",
  form_password_length_too_short: "That password is too short.",
  form_password_length_too_long: "That password is too long.",
  form_password_not_strong_enough: "That password is too easy to guess. Choose a stronger one.",
  form_password_validation_failed: "That password does not meet the requirements.",
  form_password_size_in_bytes_exceeded: "That password is too long.",
  form_identifier_exists: "That email address is already in use.",
  form_param_format_invalid: "That does not look right. Check it and try again.",
  form_code_incorrect: "That code is not correct. Check the email and try again.",
  verification_expired: "That code has expired. Send a new one.",
  verification_failed: "Too many incorrect attempts. Send a new code and try again.",
  too_many_requests: "Too many attempts. Wait a moment, then try again.",
  external_account_exists: "That account is already connected to someone else.",
  oauth_access_denied: "The connection was cancelled.",
  session_reverification_required: "Confirm it is you, then try again.",
  authentication_invalid: "Your session has ended. Sign in again.",
};

export const cancelledMessage = "Cancelled. Nothing was changed.";

/** A message safe to show the account owner, without provider internals. */
export function describeAccountError(error: unknown, fallback: string) {
  if (isReverificationCancelledError(error)) return cancelledMessage;
  if (!isClerkAPIResponseError(error)) return fallback;
  const code = error.errors[0]?.code ?? "";
  return messages[code] ?? fallback;
}
