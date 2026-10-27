// Single-series column chart: one bar per category, including categories with
// nothing in them so gaps are visible. The tallest bar is labelled on its cap
// and every bar shows its count on hover/focus; a screen-reader table carries
// the same numbers. Bars grow or shrink into place when the counts change.
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
  const max = Math.max(0, ...counts.map((entry) => entry.count));

  if (max === 0) {
    return <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{emptyText}</p>;
  }

  return (
    <figure>
      <div className="overflow-x-auto">
        <div className="flex h-44 w-full min-w-max border-b border-neutral-300 pt-6">
          {counts.map(({ label, count }) => {
            const height = `${(count / max) * 100}%`;
            return (
              <div
                key={label}
                tabIndex={0}
                aria-label={`${label}: ${noun(count)}`}
                className={`group relative flex flex-1 items-end justify-center outline-none ${barClassName}`}
              >
                <div
                  className="w-6 rounded-t bg-primary transition-[background-color,height] duration-300 group-hover:bg-secondary group-focus-visible:bg-secondary"
                  style={{ height }}
                />
                <span
                  aria-hidden="true"
                  style={{ bottom: `calc(${height} + 4px)` }}
                  className={`pointer-events-none absolute whitespace-nowrap text-xs font-semibold text-neutral-700 transition-[bottom] duration-300 ${
                    count === max ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  }`}
                >
                  {formatCount(count)}
                </span>
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" className="flex w-full min-w-max pt-1.5">
          {counts.map(({ label }) => (
            <span key={label} className={`flex-1 text-center text-[11px] text-neutral-500 ${barClassName}`}>
              {label}
            </span>
          ))}
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
