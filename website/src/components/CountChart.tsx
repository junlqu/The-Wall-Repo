"use client";

import { useState } from "react";

// About how wide a bar's count is, to leave room for all of them at once: the
// longest count at 6px a character. Any wider and a chart that would fit scrolls.
export function countWidth(texts: string[]) {
  return Math.max(0, ...texts.map((text) => text.length)) * 6;
}

// Off by default: the tallest bar is labelled and the rest wait to be asked.
export function AllNumbersButton({ showing, onChange }: { showing: boolean; onChange: (showing: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={showing}
      onClick={() => onChange(!showing)}
      className="shrink-0 text-xs font-semibold text-neutral-500 underline-offset-2 transition-colors hover:text-primary hover:underline"
    >
      {showing ? "Hide numbers" : "Show all numbers"}
    </button>
  );
}

// One bar with its count on its cap, in a button filling its slot of the chart.
// Touch screens have no hover, so tapping the slot is what shows the count there.
export function ChartBar({
  name,
  height,
  text,
  labelled,
  dimmed,
  onToggle,
  edge,
  barClassName,
  widthClassName,
  className,
}: {
  // "4–5 PM: 12 climbers".
  name: string;
  height: string;
  text: string;
  // Shows the count without hovering or focusing.
  labelled: boolean;
  // Fades back while another bar is selected. Colour stays with what a bar
  // shows, so being selected never changes it.
  dimmed: boolean;
  onToggle: () => void;
  // On the chart's first or last bar, a long count runs inwards so it isn't cut
  // off by the chart's edge.
  edge?: "start" | "end";
  barClassName: string;
  // The bar's width, and where it sits in its slot.
  widthClassName: string;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onToggle}
      className={`group flex flex-1 items-end outline-none ${className}`}
    >
      <span style={{ height }} className={`relative block transition-[height] duration-300 ${widthClassName}`}>
        <span
          className={`block h-full rounded-t outline-offset-2 outline-neutral-500 transition-opacity duration-300 group-focus-visible:outline-2 ${
            dimmed ? "opacity-40" : ""
          } ${barClassName}`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-full mb-1 whitespace-nowrap text-xs font-semibold text-neutral-700 ${
            edge === "start" ? "left-0" : edge === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          } ${labelled ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
        >
          {text}
        </span>
      </span>
    </button>
  );
}

// Single-series column chart: one bar per category, including categories with
// nothing in them so gaps are visible. The tallest bar is labelled on its cap
// and any bar shows its count when tapped, hovered or focused, or all of them at
// once by choice; a screen-reader table carries the same numbers. Bars grow or
// shrink into place when the counts change.
export default function CountChart({
  counts,
  noun,
  caption,
  categoryHeader,
  emptyText,
  barClassName = "min-w-9",
  formatCount = String,
  countHeader = "Count",
}: {
  counts: { label: string; count: number }[];
  // "3 routes" - used in each bar's accessible name.
  noun: (count: number) => string;
  caption: string;
  categoryHeader: string;
  emptyText: string;
  // Each bar's minimum width - wider for long labels like names.
  barClassName?: string;
  // How a count is written on its bar and in the table - "$120", "4.5".
  formatCount?: (count: number) => string;
  countHeader?: string;
}) {
  const [tapped, setTapped] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(0, ...counts.map((entry) => entry.count));

  if (max === 0) {
    return <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{emptyText}</p>;
  }

  // The counts can change under a tapped bar, and that bar can go with them.
  const selected = counts.some((entry) => entry.label === tapped) ? tapped : null;
  // Each count fits over its own bar, however wide that makes the chart. It widens
  // the chart as a whole, so the bars and their names keep sharing it evenly.
  const minWidth = showAll ? (countWidth(counts.map(({ count }) => formatCount(count))) + 8) * counts.length : undefined;

  return (
    <figure>
      <div className="mb-1 flex justify-end">
        <AllNumbersButton showing={showAll} onChange={setShowAll} />
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div className="flex h-44 w-full min-w-max border-b border-neutral-300 pt-6">
            {counts.map(({ label, count }, index) => (
              <ChartBar
                key={label}
                edge={showAll ? undefined : index === 0 ? "start" : index === counts.length - 1 ? "end" : undefined}
                name={`${label}: ${noun(count)}`}
                height={`${(count / max) * 100}%`}
                text={formatCount(count)}
                labelled={showAll || (selected === null ? count === max : selected === label)}
                dimmed={selected !== null && selected !== label}
                onToggle={() => setTapped(selected === label ? null : label)}
                barClassName="bg-primary"
                widthClassName="w-6"
                className={`justify-center ${barClassName}`}
              />
            ))}
          </div>
          <div aria-hidden="true" className="flex w-full min-w-max pt-1.5">
            {counts.map(({ label }) => (
              <span key={label} className={`flex-1 text-center text-[11px] text-neutral-500 ${barClassName}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryHeader}</th>
            <th scope="col">{countHeader}</th>
          </tr>
        </thead>
        <tbody>
          {counts.map(({ label, count }) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{formatCount(count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
