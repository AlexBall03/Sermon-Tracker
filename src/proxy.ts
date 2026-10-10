import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isAuthConfigured } from "@/lib/env";
import { appRoutes, routes } from "@/lib/site";
import { applySplash } from "@/lib/splash";

const isAppRoute = createRouteMatcher(appRoutes.map((route) => `${route}(.*)`));
const isGuestRoute = createRouteMatcher([
  routes.home,
  `${routes.signIn}(.*)`,
  `${routes.acceptInvitation}(.*)`,
]);

/**
 * Routing only: guests are sent to sign-in and signed-in visitors skip the
 * public pages. Roles and account status are checked on the server by the
 * pages and actions themselves (src/features/auth/access.ts).
 *
 * It also notes who the site is being shown to, so the page can show its
 * loading screen on a first visit and on the first page after signing in
 * (src/lib/splash.ts). That is presentation only.
 */
const withClerk = clerkMiddleware(async (auth, request) => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId && isAppRoute(request)) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }
  const response =
    userId && isGuestRoute(request)
      ? NextResponse.redirect(new URL(routes.dashboard, request.url))
      : NextResponse.next();
  return applySplash(request, response, userId);
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Without Clerk keys nobody can be signed in, so application routes stay closed.
  if (!isAuthConfigured()) {
    const response = isAppRoute(request)
      ? NextResponse.redirect(new URL(routes.signIn, request.url))
      : NextResponse.next();
    return applySplash(request, response, null);
  }
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
