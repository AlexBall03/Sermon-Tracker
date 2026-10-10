import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";

/**
 * Minimal centred shell for sign-in, invitation acceptance, and access
 * notices: the logo above one card (an AuthNotice or Clerk's form). The
 * wrapper gives whichever card it holds the lit edge and a faint glow.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-x-clip px-5 py-12 sm:py-16">
      {/* 25rem is the width of Clerk's card. */}
      <div className="w-full max-w-[25rem]">
        <div className="mb-8 flex justify-center">
          <Link
            href={routes.home}
            aria-label="Sermon Tracker home"
            className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80"
          >
            <Logo />
          </Link>
        </div>
        <main id="main" className="hero-glow lit-edge rounded-xl">
          {children}
        </main>
      </div>
    </div>
  );
}
