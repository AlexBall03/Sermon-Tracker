import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { AppHeader } from "@/components/layout/app-header";
import { PageLoading } from "@/components/layout/page-loading";
import { requireActiveUser } from "@/features/auth/access";

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
    <>
      <AppHeader isAdmin={user.role === "admin"} />
      <main id="main" className="flex-1 pt-16">
        {children}
      </main>
    </>
  );
}

/** The bar and an empty canvas, shown while the account is being checked. */
function ShellFallback() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b glass">
        <div className="container-page flex h-16 items-center">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex-1 pt-16">
        <PageLoading />
      </main>
    </>
  );
}
