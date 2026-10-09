import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

/**
 * Maps Clerk's components onto the semantic tokens in globals.css. The values
 * are CSS variables, so light and dark follow the existing theme class with no
 * second theme mechanism.
 */
export const clerkAppearance: NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]> = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--surface)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorNeutral: "var(--foreground)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    fontFamily: "var(--font-montserrat), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-none rounded-xl border bg-surface shadow-raised",
    card: "bg-surface shadow-none",
    headerTitle: "font-display text-2xl font-semibold tracking-tight",
    footer: "bg-surface",
  },
};
