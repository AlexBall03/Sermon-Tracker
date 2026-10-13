import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { PageLoading } from "@/components/layout/page-loading";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The shell of account setup: the bar with the logo, and nothing else. It is
 * beside the application's shell, not inside it, because that shell is closed
 * to an account that has not finished setup, and its navigation leads only to
 * pages such an account cannot open yet.
 *
 * It checks nothing itself. The page beneath it does, behind the boundary
 * here, since a layout is not run again on every navigation.
 */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass">
        <div className="container-page flex h-bar items-center">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex-1 pt-bar">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </>
  );
}
