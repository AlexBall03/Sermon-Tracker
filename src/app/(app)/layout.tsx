import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { AppHeader } from "@/components/layout/app-header";
import { BackToTop } from "@/components/layout/back-to-top";
import { PageLoading } from "@/components/layout/page-loading";
import { ToastProvider } from "@/components/ui/toast";
import { requireActiveUser } from "@/features/auth/access";
import { QuickCaptureProvider } from "@/features/ideas/components/quick-capture";
import { ScriptureProvider } from "@/features/scripture/components/scripture-provider";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Authenticated shell. Everything below it is rendered per request for an
 * active account; nothing here is cached or prerendered with user data.
 * Pages still call the access helpers themselves, because a layout is not
 * re-run on every navigation.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireActiveUser();
  return (
    // One of each for the whole shell: confirmations, the Scripture Panel, and
    // quick capture, which uses both. They hold no account data.
    <ToastProvider aboveTabBar>
      <ScriptureProvider>
        <QuickCaptureProvider>
          <AppHeader isAdmin={user.role === "admin"} />
          {/* Below `md` the tab bar is fixed over the foot of the page; leave it room. */}
          <main
            id="main"
            className="flex-1 pt-bar max-md:pb-[calc(var(--bar-h)+env(safe-area-inset-bottom))]"
          >
            {children}
          </main>
          <BackToTop aboveTabBar />
        </QuickCaptureProvider>
      </ScriptureProvider>
    </ToastProvider>
  );
}

/** The bar and an empty canvas, shown while the account is being checked. */
function ShellFallback() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass">
        <div className="container-page flex h-bar items-center">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex-1 pt-bar">
        <PageLoading />
      </main>
    </>
  );
}
