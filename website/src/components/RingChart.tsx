"use client";

import { useState } from "react";

const CENTER = 50;
const RADIUS = 49;
const HOLE_RADIUS = 30;

// Where a share of the way round a circle lands, clockwise from the top.
function pointAt(share: number, radius: number) {
  const angle = 2 * Math.PI * share - Math.PI / 2;
  return `${CENTER + radius * Math.cos(angle)} ${CENTER + radius * Math.sin(angle)}`;
}

function arc(radius: number, from: number, to: number, clockwise: boolean) {
  const large = Math.abs(to - from) > 0.5 ? 1 : 0;
  return `A ${radius} ${radius} 0 ${large} ${clockwise ? 1 : 0} ${pointAt(to, radius)}`;
}

// An arc that ends where it starts draws nothing, so a whole circle takes two.
function circlePath(radius: number, clockwise: boolean) {
  return `M ${pointAt(0, radius)} ${arc(radius, 0, 0.5, clockwise)} ${arc(radius, 0.5, 1, clockwise)} Z`;
}

const WHOLE_RING = `${circlePath(RADIUS, true)} ${circlePath(HOLE_RADIUS, false)}`;

// Round the outside, across to the hole, and back round its edge.
function slicePath(start: number, end: number) {
  return `M ${pointAt(start, RADIUS)} ${arc(RADIUS, start, end, true)} L ${pointAt(end, HOLE_RADIUS)} ${arc(HOLE_RADIUS, end, start, false)} Z`;
}

function formatShare(share: number) {
  if (share === 0) return "0%";
  return share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`;
}

// A whole split into slices of a ring, with each slice's name, count and share
// always written out beside it, since a thin slice has no room for its own. Tapping
// a slice or its row fades the rest back, as on the bar charts.
export default function RingChart({
  slices,
  formatValue,
  caption,
  emptyText,
}: {
  // Colours stay with what a slice shows, whichever others are in the chart. One
  // of 0 keeps its row, with nothing to draw.
  slices: { name: string; value: number; color: string }[];
  formatValue: (value: number) => string;
  caption: string;
  emptyText: string;
}) {
  const [tapped, setTapped] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <p className="flex h-36 items-center justify-center text-sm text-neutral-500">{emptyText}</p>;
  }

  // The counts can change under a tapped slice, and that slice can go with them.
  const selected = slices.some((slice) => slice.name === tapped && slice.value > 0) ? tapped : null;
  const toggle = (name: string) => setTapped(selected === name ? null : name);
  const fade = (name: string) => `transition-opacity duration-300 ${selected !== null && selected !== name ? "opacity-40" : ""}`;
  const drawn = slices.filter((slice) => slice.value > 0);
  // How far round the circle each slice starts.
  const starts = drawn.map((_, index) => drawn.slice(0, index).reduce((sum, slice) => sum + slice.value, 0) / total);

  return (
    // The rows go under the chart when there isn't room beside it.
    <figure className="flex flex-wrap items-center justify-center gap-4">
      <figcaption className="sr-only">{caption}</figcaption>
      {/* The rows beside it say all this and take the keyboard. */}
      <svg aria-hidden="true" viewBox="0 0 100 100" className="h-36 w-36 shrink-0">
        {drawn.map(({ name, value, color }, index) => {
          const share = value / total;
          const start = starts[index];
          return (
            <path
              key={name}
              d={drawn.length === 1 ? WHOLE_RING : slicePath(start, start + share)}
              fill={color}
              onClick={() => toggle(name)}
              className={`cursor-pointer stroke-neutral-50 ${fade(name)}`}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${name}: ${formatValue(value)}, ${formatShare(share)}`}</title>
            </path>
          );
        })}
      </svg>

      <ul className="flex min-w-0 max-w-sm flex-1 basis-48 flex-col">
        {slices.map(({ name, value, color }) => {
          const hasSlice = value > 0;
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={selected === name}
                disabled={!hasSlice}
                onClick={() => toggle(name)}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs outline-offset-1 outline-neutral-500 focus-visible:outline-2 enabled:hover:bg-neutral-100 ${
                  selected === name ? "bg-neutral-100" : ""
                }`}
              >
                <span aria-hidden="true" style={{ backgroundColor: color }} className={`h-2.5 w-2.5 shrink-0 rounded-sm ${fade(name)}`} />
                <span className="min-w-0 flex-1 text-neutral-600">{name}</span>
                <span className="font-semibold tabular-nums text-neutral-700">{formatValue(value)}</span>
                <span className="w-8 text-right tabular-nums text-neutral-500">{formatShare(value / total)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
