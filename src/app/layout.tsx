import type { Metadata, Viewport } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { NavigationProgress } from "@/components/layout/navigation-progress";
import { SplashScreen } from "@/components/layout/splash-screen";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { isAuthConfigured, isIndexable } from "@/lib/env";
import { routes, siteConfig } from "@/lib/site";
import "./globals.css";

// All interface text: navigation, controls, tables, forms, body copy.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

// Headlines, page titles, and sermon material (idea titles, Scripture).
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

const title = `${siteConfig.name} — ${siteConfig.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: title, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title,
    description: siteConfig.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: siteConfig.description,
  },
  // Pages opt in to indexing; previews are never indexable.
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

/**
 * Clerk wraps the tree only when its keys are configured, so the public site
 * still builds and runs without credentials. It sits inside <body>, as Cache
 * Components requires.
 */
function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured()) return children;
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl={routes.signIn}
      signUpUrl={routes.acceptInvitation}
      signInFallbackRedirectUrl={routes.dashboard}
      signUpFallbackRedirectUrl={routes.dashboard}
      afterSignOutUrl={routes.home}
    >
      {children}
    </ClerkProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${playfair.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-[60] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Skip to content
        </a>
        <AuthProvider>
          <ThemeProvider>
            {/* After the theme's own script, so both are painted in the right colours first time. */}
            <SplashScreen />
            <NavigationProgress />
            {children}
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
