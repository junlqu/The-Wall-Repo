"use client";

import { useSyncExternalStore } from "react";

// Pages that need a login send the visitor to /login?next=<their page>, and
// login/signup send them back there once they're in.
const PARAM = "next";

// Only same-site paths - "//evil.com" or "/\evil.com" would leave the site.
function safePath(path: string | null) {
  return path && /^\/(?![/\\])/.test(path) ? path : null;
}

export function withReturnTo(href: string, returnTo: string | null) {
  return returnTo ? `${href}?${PARAM}=${encodeURIComponent(returnTo)}` : href;
}

const noopSubscribe = () => () => {};

// Read straight from the URL - useSearchParams would need a Suspense
// boundary to build in the static export.
export function useReturnTo(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => safePath(new URLSearchParams(window.location.search).get(PARAM)),
    () => null,
  );
}
