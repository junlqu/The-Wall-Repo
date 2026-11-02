"use client";

import { useState } from "react";
import { AllNumbersButton, ChartBar, countWidth } from "@/components/CountChart";

// CountChart with a bar per series in each category, and a legend naming them.
// A series with nothing to say for a category (null) leaves its place empty, as
// opposed to a bar of zero. Colours stay with the series however many are shown.
export default function GroupedCountChart({
  series,
  counts,
  noun,
  caption,
  categoryHeader,
  emptyText,
  formatCount,
  barClassName,
}: {
  // Each series' bars and legend swatch are coloured by its `colorClassName`.
  series: { name: string; colorClassName: string }[];
  // `values` lines up with `series`.
  counts: { label: string; values: (number | null)[] }[];
  noun: (count: number) => string;
  caption: string;
  categoryHeader: string;
  emptyText: string;
  formatCount: (count: number) => string;
  // Each category's minimum width.
  barClassName: string;
}) {
  const [tapped, setTapped] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(0, ...counts.flatMap((entry) => entry.values.map((value) => value ?? 0)));

  if (max === 0) {
    return <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{emptyText}</p>;
  }

  const barId = (label: string, name: string) => `${label}/${name}`;
  const ids = counts.flatMap(({ label, values }) =>
    series.flatMap(({ name }, index) => (values[index] === null ? [] : [barId(label, name)])),
  );
  // The counts can change under a tapped bar, and that bar can go with them.
  const selected = tapped !== null && ids.includes(tapped) ? tapped : null;
  // A category's counts run outwards from its bars in the middle, so it needs room
  // for one each way.
  const texts = counts.flatMap(({ values }) => values.flatMap((value) => (value === null ? [] : [formatCount(value)])));
  const minWidth = showAll ? countWidth(texts) * series.length + 10 : undefined;

  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map(({ name, colorClassName }) => (
            <li key={name} className="flex items-center gap-1.5 text-xs text-neutral-600">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colorClassName}`} />
              {name}
            </li>
          ))}
        </ul>
        <AllNumbersButton showing={showAll} onChange={setShowAll} />
      </div>

      <div className="overflow-x-auto">
        <div className="flex h-44 w-full min-w-max border-b border-neutral-300 pt-6">
          {counts.map(({ label, values }, category) => (
            <div key={label} style={{ minWidth }} className={`flex flex-1 ${barClassName}`}>
              {series.map(({ name, colorClassName }, index) => {
                const value = values[index];
                if (value === null) return <span key={name} aria-hidden="true" className="flex-1" />;
                const id = barId(label, name);
                // Side by side at the middle of the category, a 2px gap between.
                const place = series.length === 1 ? "justify-center" : index === 0 ? "justify-end pr-px" : "justify-start pl-px";
                return (
                  <ChartBar
                    key={name}
                    edge={
                      showAll && series.length > 1
                        ? index === 0
                          ? "end"
                          : "start"
                        : !showAll && category === 0
                          ? "start"
                          : !showAll && category === counts.length - 1
                            ? "end"
                            : undefined
                    }
                    name={`${label}, ${name}: ${noun(value)}`}
                    height={`${(value / max) * 100}%`}
                    text={formatCount(value)}
                    labelled={showAll || (selected === null ? value === max : selected === id)}
                    dimmed={selected !== null && selected !== id}
                    onToggle={() => setTapped(selected === id ? null : id)}
                    barClassName={colorClassName}
                    widthClassName="w-5"
                    className={place}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex w-full min-w-max pt-1.5">
          {counts.map(({ label }) => (
            <span key={label} style={{ minWidth }} className={`flex-1 text-center text-[11px] text-neutral-500 ${barClassName}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* A table won't shrink below its content, so sr-only goes around it: these
          long headers would otherwise widen the page on a phone. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{categoryHeader}</th>
              {series.map(({ name }) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {counts.map(({ label, values }) => (
              <tr key={label}>
                <td>{label}</td>
                {values.map((value, index) => (
                  <td key={series[index].name}>{value === null ? "—" : formatCount(value)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
