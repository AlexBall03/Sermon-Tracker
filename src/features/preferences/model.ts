/**
 * What an account says about itself beyond its sign-in identity. Plain values
 * with no database or server code, so the schema, the server action, and any
 * form in the browser read the same limits.
 */

/** The database enforces the same limits with CHECK constraints. */
export const profileLimits = { churchName: 120, ministryRole: 80 } as const;
