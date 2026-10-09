import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";

/** Minimal centred shell for sign-in. Clerk's components mount here in Phase 1B. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="absolute top-1/4 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <Link href={routes.home} className="mb-8 rounded-lg" aria-label="Sermon Tracker home">
        <Logo />
      </Link>
      <main id="main" className="w-full max-w-md">
        {children}
      </main>
    </div>
  );
}
