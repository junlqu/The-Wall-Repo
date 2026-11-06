"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

// How tall content can be before it's cut short, in pixels.
const MAX_HEIGHT = 192;
// Content only a little over is shown whole - hiding a line or two behind a
// button saves nothing.
const SLACK = 64;

// Cuts long content short, fading it out into the card behind it with a
// "Read more" to show the rest. `fade` is a gradient-from class in the card's
// background colour, e.g. "from-white"; `onDark` is for dark cards.
export default function ReadMore({
  children,
  fade,
  onDark = false,
}: {
  children: ReactNode;
  fade: string;
  onDark?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [tooLong, setTooLong] = useState(false);
  const [open, setOpen] = useState(false);
  const id = useId();

  // The content's own height, unclipped - and again whenever it changes, as
  // the card's width does.
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setTooLong(element.offsetHeight > MAX_HEIGHT + SLACK);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const collapsed = tooLong && !open;

  return (
    <div className="flex flex-col gap-2">
      <div
        id={id}
        className={`relative ${collapsed ? "overflow-hidden" : ""}`}
        style={collapsed ? { maxHeight: MAX_HEIGHT } : undefined}
      >
        <div ref={content}>{children}</div>
        {collapsed && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t ${fade} to-transparent`}
          />
        )}
      </div>
      {tooLong && (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={id}
          className={`self-start text-sm font-semibold underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
            onDark ? "text-secondary" : "text-primary"
          }`}
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
