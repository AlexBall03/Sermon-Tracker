/*
 * Whether this window is the installed application rather than a browser tab.
 * Browser-only: on the server, and before hydration, the answer is false.
 */

const installedModes = [
  "(display-mode: standalone)",
  "(display-mode: minimal-ui)",
  "(display-mode: window-controls-overlay)",
];

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Safari on iOS says so on `navigator`; the media query covers everything else.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return installedModes.some((mode) => window.matchMedia?.(mode).matches);
}
