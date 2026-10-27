"use client";

import { type ReactNode, useEffect, useState } from "react";

const DEFAULT_ROTATE_MS = 8000;
const CONTROL_CLASS =
  "rounded-full bg-white p-1.5 text-neutral-600 shadow-sm ring-1 ring-neutral-200 transition-colors hover:text-primary";

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
// slide is as tall as the tallest, so the page doesn't jump as it turns.
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
      className="flex h-full flex-col gap-3"
    >
      <div className="relative flex-1 overflow-hidden rounded-xl">
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
      </div>

      {count > 1 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {items.map((item, i) => (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${i + 1} of ${count}`}
                aria-current={i === current}
                className={`h-2 rounded-full transition-all ${i === current ? "w-6 bg-primary" : "w-2 bg-neutral-300"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous"
              className={CONTROL_CLASS}
            >
              <ArrowIcon direction="previous" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next"
              className={CONTROL_CLASS}
            >
              <ArrowIcon direction="next" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
