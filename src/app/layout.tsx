import type { Metadata, Viewport } from "next";

import { AppClerkProvider } from "@/components/layout/clerk-provider";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { SplashScreen } from "@/components/layout/splash-screen";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PwaRuntime } from "@/features/pwa/pwa-runtime";
import { isAuthConfigured, isIndexable } from "@/lib/env";
import { siteConfig } from "@/lib/site";
import { fontVariables } from "./fonts";
import "./globals.css";

const title = `${siteConfig.name} — ${siteConfig.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: title, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  /*
   * One share card for the whole site, `opengraph-image.png` beside this file
   * (made by `npm run brand:assets -- share`, from scripts/brand/share-card.mjs).
   * Next adds its address, size, type, and alt text from the file, and gives the
   * Twitter card the same image because `twitter` names none. A page that sets
   * its own `openGraph` replaces all of this, the image included.
   */
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    url: "/",
    title,
    description: siteConfig.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: siteConfig.description,
  },
  /*
   * The installed application (features/pwa). The manifest is `manifest.ts`
   * beside this file. On iOS the status bar keeps its own strip, so nothing is
   * drawn under it and the bar needs no inset at the top.
   */
  appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "default" },
  // Pages opt in to indexing; previews are never indexable.
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  // Without this a phone reports no safe-area insets, and the tab bar sits on the home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

/**
 * Clerk wraps the tree only when its keys are configured, so the public site
 * still builds and runs without credentials. It sits inside <body>, as Cache
 * Components requires. The provider itself is `AppClerkProvider`, which also
 * gives Clerk's own forms the page's language.
 */
function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured()) return children;
  return <AppClerkProvider>{children}</AppClerkProvider>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-[60] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Skip to content
        </a>
        <AuthProvider>
          <ThemeProvider>
            {/* After the theme's own script, so both are painted in the right colors first time. */}
            <SplashScreen />
            <NavigationProgress />
            <PwaRuntime />
            {children}
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
