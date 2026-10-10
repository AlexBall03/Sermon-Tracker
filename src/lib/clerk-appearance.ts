import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

/**
 * Maps Clerk's components onto the semantic tokens in globals.css. The values
 * are CSS variables, so light and dark follow the existing theme class with no
 * second theme mechanism. The card matches AuthNotice: same radius, hairline,
 * and shadow, so a form and a notice look like the same object.
 */
export const clerkAppearance: NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]> = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--surface-raised)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorNeutral: "var(--foreground)",
    colorInput: "var(--surface-raised)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    fontFamily: "var(--font-montserrat), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: { width: "100%" },
    // Style objects, because Clerk's own radius and shadow outrank utility classes.
    cardBox: {
      width: "100%",
      maxWidth: "none",
      borderRadius: "0.75rem",
      border: "1px solid var(--border)",
      boxShadow: "var(--elevation-raised)",
      // Opaque, so the glow behind the card cannot tint Clerk's translucent footer strip.
      backgroundColor: "var(--surface-raised)",
    },
    card: { borderRadius: 0, boxShadow: "none" },
    headerTitle: {
      fontFamily: "var(--font-playfair), ui-serif, Georgia, serif",
      fontSize: "1.5rem",
      fontWeight: 500,
      letterSpacing: "-0.01em",
    },
    // Same height, weight, and hover as the application's primary Button.
    formButtonPrimary: {
      minHeight: "2.5rem",
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "none",
      boxShadow: "var(--elevation-card)",
      transition: "background-color 200ms ease-out",
      // Clerk's gradient sheen
      "&::after": { display: "none" },
      "&:hover": { backgroundColor: "var(--primary-hover)", boxShadow: "var(--elevation-card)" },
    },
    // Clerk draws an input's border as a box shadow. These mirror ui/input.tsx.
    formFieldInput: {
      minHeight: "2.5rem",
      backgroundColor: "var(--surface)",
      boxShadow: "0 0 0 1px var(--input), var(--elevation-card)",
      transition: "box-shadow 200ms ease-out",
      "&:hover": {
        boxShadow:
          "0 0 0 1px color-mix(in oklab, var(--foreground) 30%, transparent), var(--elevation-card)",
      },
      // Important: Clerk's own focus ring is a solid 4px band in the ring colour.
      "&:focus, &:focus-visible, &:focus-within": {
        boxShadow: "0 0 0 1px var(--ring), var(--elevation-focus) !important",
        outline: "none",
      },
    },
    formFieldLabel: { fontWeight: 500 },
    // Matches the outline Button.
    socialButtonsBlockButton: {
      minHeight: "2.5rem",
      boxShadow: "0 0 0 1px var(--input), var(--elevation-card)",
      transition: "background-color 150ms ease-out, box-shadow 150ms ease-out",
      "&:hover": {
        backgroundColor: "var(--background)",
        boxShadow:
          "0 0 0 1px color-mix(in oklab, var(--primary) 70%, transparent), var(--elevation-card)",
      },
    },
    // Clerk hangs "Last used" over the button's top corner. Here it is an ordinary
    // badge in the button's own row, after the label, like ui/badge.tsx in its muted tone.
    lastAuthenticationStrategyBadge: {
      position: "static",
      transform: "none",
      order: 2,
      flex: "none",
      marginLeft: "0.5rem",
      padding: "0.125rem 0.375rem",
      borderRadius: "0.375rem",
      border: 0,
      boxShadow: "none",
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
      fontSize: "0.6875rem",
      fontWeight: 600,
      lineHeight: 1.45,
      // Below this the button cannot hold its label and the badge on one line.
      "@media (max-width: 25.99rem)": { display: "none" },
    },
  },
};
