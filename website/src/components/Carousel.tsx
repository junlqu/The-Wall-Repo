"use client";

import { type ReactNode, useEffect, useState } from "react";

const DEFAULT_ROTATE_MS = 8000;
const CONTROL_CLASS =
  "rounded-full bg-white/40 p-1.5 text-neutral-700 shadow-sm ring-1 ring-white/30 backdrop-blur-sm transition-colors hover:bg-white/80 hover:text-primary";

// Padding for slides with text, keeping it clear of the arrows at the sides
// and the dots along the bottom.
export const SLIDE_PADDING = "px-12 pt-6 pb-12 sm:px-16 sm:pt-8";

function ArrowIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      {direction === "previous" ? (
        <path d="M12.7 15.3a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 1 1 1.4 1.4L8.42 9.6l4.3 4.3a1 1 0 0 1 0 1.4z" />
      ) : (
        <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
      )}
    </svg>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Slides one item at a time, moving on by itself every `rotateMs` - except
// while it's hovered or focused, or the visitor prefers less motion. Every
// slide is as tall as the tallest, so the page doesn't jump as it turns. The
// arrows sit on either side and the dots along the bottom, over the slides.
export default function Carousel<T>({
  label,
  items,
  getKey,
  renderItem,
  rotateMs = DEFAULT_ROTATE_MS,
}: {
  label: string;
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  rotateMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  // The list can shrink under it, so it's kept in range here rather than reset.
  const current = count > 0 ? index % count : 0;

  const step = (delta: number) => setIndex((i) => (i + delta + count) % count);

  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion()) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), rotateMs);
    return () => clearTimeout(timer);
  }, [count, paused, rotateMs, current]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className="relative h-full overflow-hidden rounded-xl"
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {items.map((item, i) => (
          <div
            key={getKey(item)}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== current}
            inert={i !== current}
            className="w-full shrink-0"
          >
            {renderItem(item)}
          </div>
        ))}
      </div>

      {/* The controls sit over the slides - slides with text keep clear of
          them with SLIDE_PADDING. */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className={`absolute top-1/2 left-2 -translate-y-1/2 sm:left-3 ${CONTROL_CLASS}`}
          >
            <ArrowIcon direction="previous" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className={`absolute top-1/2 right-2 -translate-y-1/2 sm:right-3 ${CONTROL_CLASS}`}
          >
            <ArrowIcon direction="next" />
          </button>
          {/* The faint outline keeps the white dots visible on light slides too. */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {items.map((item, i) => (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${i + 1} of ${count}`}
                aria-current={i === current}
                className={`h-2 rounded-full shadow-sm ring-1 ring-black/15 transition-all ${
                  i === current ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
