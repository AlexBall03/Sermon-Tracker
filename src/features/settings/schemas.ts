import { z } from "zod";

/**
 * Input rules for the account forms. They give quick, readable feedback; the
 * sign-in provider still applies its own rules (password strength, breached
 * passwords, address ownership) and has the final say.
 */

const nameLimit = 64;

export const nameSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .max(nameLimit, `Use ${nameLimit} characters or fewer.`),
  lastName: z.string().trim().max(nameLimit, `Use ${nameLimit} characters or fewer.`),
});
export type NameInput = z.infer<typeof nameSchema>;

export const emailSchema = z
  .string()
  .trim()
  .max(254, "That address is too long.")
  .pipe(z.email("Enter a valid email address."));

export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

export const passwordSchema = z
  .object({
    /** Asked for only when the account already has a password. */
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128, "Use 128 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });
export type PasswordInput = z.infer<typeof passwordSchema>;

export const avatarTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const avatarMaxBytes = 10 * 1024 * 1024;

/** A message when the file cannot be used as a profile picture, otherwise null. */
export function validateAvatar(file: { type: string; size: number }) {
  if (!avatarTypes.includes(file.type)) return "Choose a PNG, JPEG, WebP, or GIF image.";
  if (file.size > avatarMaxBytes) return "Choose an image smaller than 10 MB.";
  return null;
}

/** The first message for each field, keyed by field name. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
