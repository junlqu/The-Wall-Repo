"use client";

import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from "react";

// A triangle and the signed difference, both green for more and red for less.
export function ChangeMark({
  change,
  format,
  className = "text-sm",
}: {
  change: number;
  format: (value: number) => string;
  className?: string;
}) {
  if (change === 0) return <span className={`whitespace-nowrap font-semibold text-neutral-500 ${className}`}>No change</span>;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${up ? "text-green-700" : "text-red-700"} ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-current">
        <path d={up ? "M5 1 9.5 9H.5z" : "M5 9 .5 1h9z"} />
      </svg>
      {up ? "+" : "−"}
      {format(Math.abs(change))}
    </span>
  );
}

type Hovered = { id: string; column: string; value: number };

const ColumnCompareContext = createContext<{
  hovered: Hovered | null;
  settle: (next: Hovered | null) => void;
} | null>(null);

// Long enough that crossing the table on the way to something else changes nothing.
const SETTLE_MS = 100;

// Around a table of ComparedCells. Hovering one puts each of the rest of its column's
// difference from it beside them. The cells read this directly, so the rows between
// them, and any charts open in those rows, don't re-render.
export function ColumnCompare({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = (next: Hovered | null) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(next), SETTLE_MS);
  };

  return <ColumnCompareContext.Provider value={{ hovered, settle }}>{children}</ColumnCompareContext.Provider>;
}

// Steps aside for the differences of the column before it, whose marks need the room.
export function HiddenWhileComparing({ column, children }: { column: string; children: ReactNode }) {
  const compare = useContext(ColumnCompareContext);
  return <span className={compare?.hovered?.column === column ? "invisible" : ""}>{children}</span>;
}

// One number in a compared column. Only a mouse hovers: a tap also sends these
// events, and it shouldn't count as one.
export function ComparedCell({
  column,
  value,
  format = (count) => count.toLocaleString(),
  className,
}: {
  column: string;
  value: number;
  format?: (value: number) => string;
  className: string;
}) {
  const compare = useContext(ColumnCompareContext);
  const id = useId();
  const hovered = compare?.hovered?.column === column ? compare.hovered : null;

  return (
    <td
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") compare?.settle({ id, column, value });
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") compare?.settle(null);
      }}
      className={`${className} ${hovered?.id === id ? "bg-neutral-100" : ""}`}
    >
      {/* Out of the flow, so the number stays put and nothing else in the table moves.
          It can lie over the next column, so it hides what it covers there and lets
          the pointer through. */}
      <span className="relative inline-block">
        {format(value)}
        {hovered && hovered.id !== id && (
          <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-1 flex -translate-y-1/2 items-center bg-white px-0.5">
            {value === hovered.value ? (
              <span className="text-sm font-bold text-amber-600">~</span>
            ) : (
              <ChangeMark change={value - hovered.value} format={format} className="text-xs" />
            )}
          </span>
        )}
      </span>
    </td>
  );
}
