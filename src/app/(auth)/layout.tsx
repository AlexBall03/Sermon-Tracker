import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";

/** Minimal centred shell for sign-in, invitation acceptance, and access notices. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div
        aria-hidden
        className="glow-emerald absolute top-1/4 left-1/2 -z-10 size-[28rem] max-w-full -translate-x-1/2"
      />
      <Link href={routes.home} className="mb-8 rounded-md" aria-label="Sermon Tracker home">
        <Logo />
      </Link>
      <main id="main" className="w-full max-w-md">
        {children}
      </main>
    </div>
  );
}
