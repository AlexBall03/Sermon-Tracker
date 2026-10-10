/**
 * Tells the page when the router begins a navigation, of any kind: a link,
 * Back or Forward, or navigation from code. The progress bar listens
 * (components/layout/navigation-progress.tsx). The router offers no hook from
 * inside React for this; this file is the supported place.
 */
export function onRouterTransitionStart(url: string) {
  window.dispatchEvent(new CustomEvent("app:navigation-start", { detail: url }));
}
