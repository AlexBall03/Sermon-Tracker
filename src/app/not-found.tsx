import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { StatusPage } from "@/components/layout/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getAccess } from "@/features/auth/access";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("navigation")).notFound.title };
}

/**
 * An address nothing answers to, anywhere on the site. It is outside the
 * application shell, so it brings its own bar, and it offers the way back
 * that fits whoever is looking.
 */
export default function NotFound() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass">
        <div className="container-page flex h-bar items-center">
          <Link
            href={routes.home}
            className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80"
          >
            <Logo />
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 pt-bar">
        <Suspense>
          <Message />
        </Suspense>
      </main>
    </>
  );
}

async function Message() {
  // The access check first: it is what marks the request as one that cannot be prerendered.
  const access = await getAccess();
  const t = (await getT("navigation")).notFound;
  const signedIn = access.state === "active";
  return (
    <StatusPage icon={Compass} eyebrow={t.code} title={t.title} body={t.body}>
      <Link href={signedIn ? routes.dashboard : routes.home} className={buttonVariants()}>
        {signedIn ? t.dashboard : t.home}
      </Link>
    </StatusPage>
  );
}
