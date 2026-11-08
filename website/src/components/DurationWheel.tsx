"use client";

import { type KeyboardEvent, useEffect, useRef } from "react";

// Each number's row, and how many rows show - the chosen one in the middle.
const ROW_PX = 36;
const VISIBLE_ROWS = 3;
// How long scrolling has to stop before the wheel settles on a number.
const SETTLE_MS = 90;

export type Duration = { days: number; hours: number; minutes: number };

export function durationMinutes({ days, hours, minutes }: Duration) {
  return (days * 24 + hours) * 60 + minutes;
}

// One column of the picker: 0 to `max`, spun by scrolling, dragging, tapping
// a number or the arrow keys.
function Wheel({
  label,
  unit,
  max,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(false);

  // Spins to the value when it's set from outside the scroll - the keys, a
  // tap, or opening at it.
  useEffect(() => {
    const wheel = ref.current;
    if (!wheel) return;
    const top = value * ROW_PX;
    if (Math.abs(wheel.scrollTop - top) > 1) {
      wheel.scrollTo({ top, behavior: mounted.current ? "smooth" : "instant" });
    }
    mounted.current = true;
  }, [value]);

  useEffect(() => () => clearTimeout(settle.current), []);

  const onScroll = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const wheel = ref.current;
      if (!wheel) return;
      const index = Math.min(max, Math.max(0, Math.round(wheel.scrollTop / ROW_PX)));
      if (index !== value) onChange(index);
    }, SETTLE_MS);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    let next: number | undefined;
    if (event.key in steps) next = value + steps[event.key];
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === undefined) return;
    event.preventDefault();
    onChange(Math.min(max, Math.max(0, next)));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="relative w-full">
        {/* The band the chosen number sits in. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 rounded-md bg-neutral-100"
          style={{ top: ROW_PX, height: ROW_PX }}
        />
        <div
          ref={ref}
          role="spinbutton"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} ${unit}`}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          className={`relative snap-y snap-mandatory overflow-y-scroll overscroll-contain rounded-md [scrollbar-width:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 [&::-webkit-scrollbar]:hidden ${
            disabled ? "pointer-events-none opacity-40" : ""
          }`}
          style={{
            height: ROW_PX * VISIBLE_ROWS,
            maskImage: "linear-gradient(transparent, black 35%, black 65%, transparent)",
          }}
        >
          <div aria-hidden="true" style={{ height: ROW_PX }} />
          {Array.from({ length: max + 1 }, (_, number) => (
            <button
              key={number}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => onChange(number)}
              className={`flex w-full snap-center items-center justify-center text-base tabular-nums transition-colors ${
                number === value ? "font-semibold text-neutral-900" : "text-neutral-400"
              }`}
              style={{ height: ROW_PX }}
            >
              {number}
            </button>
          ))}
          <div aria-hidden="true" style={{ height: ROW_PX }} />
        </div>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{unit}</span>
    </div>
  );
}

// Days, hours and minutes on three wheels, side by side.
export default function DurationWheel({
  value,
  maxDays,
  disabled = false,
  onChange,
}: {
  value: Duration;
  maxDays: number;
  disabled?: boolean;
  onChange: (value: Duration) => void;
}) {
  return (
    <div className="flex gap-2 rounded-md border border-neutral-300 bg-white px-2 py-2">
      <Wheel
        label="Days"
        unit="days"
        max={maxDays}
        value={value.days}
        disabled={disabled}
        onChange={(days) => onChange({ ...value, days })}
      />
      <Wheel
        label="Hours"
        unit="hours"
        max={23}
        value={value.hours}
        disabled={disabled}
        onChange={(hours) => onChange({ ...value, hours })}
      />
      <Wheel
        label="Minutes"
        unit="min"
        max={59}
        value={value.minutes}
        disabled={disabled}
        onChange={(minutes) => onChange({ ...value, minutes })}
      />
    </div>
  );
}
