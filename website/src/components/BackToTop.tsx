"use client";

import { useSyncExternalStore } from "react";

// How far down the page before the button shows - near the top there's
// nothing to go back to.
const SHOW_AFTER_PX = 300;

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

// A small round button in the top right, under the header, that scrolls back
// to the top of the page. It fades in once the page has been scrolled.
export default function BackToTop() {
  const scrolled = useSyncExternalStore(
    subscribe,
    () => window.scrollY > SHOW_AFTER_PX,
    () => false,
  );

  const scrollUp = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={scrolled ? undefined : -1}
      aria-hidden={!scrolled}
      onClick={scrollUp}
      className={`fixed right-2 top-[4.75rem] z-30 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-primary shadow-md transition-all duration-300 hover:border-secondary hover:text-secondary ${
        scrolled ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 -rotate-90">
        <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
      </svg>
    </button>
  );
}
