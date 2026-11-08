"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

// Each number's row, and how many rows show - the chosen one in the middle.
const ROW_PX = 36;
const VISIBLE_ROWS = 3;
// How long scrolling has to stop before the wheel settles on a number.
const SETTLE_MS = 90;

export type Duration = { days: number; hours: number; minutes: number };

export function durationMinutes({ days, hours, minutes }: Duration) {
  return (days * 24 + hours) * 60 + minutes;
}

// How far a mouse wheel or trackpad has to scroll to move one number, in
// pixels - a mouse's notch is usually about 100, so each notch is one step,
// while a trackpad's many small scrolls add up.
const WHEEL_STEP_PX = 50;
// How far the mouse has to move with the button down before it counts as a
// drag rather than a click on a number.
const DRAG_THRESHOLD_PX = 4;

// One column of the picker: 0 to `max`, spun by scrolling (or swiping on a
// touch screen), the mouse wheel - a number a notch - dragging it with the
// mouse, clicking a number or the arrow keys.
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
  // A mouse drag in progress: where it started, and whether it's moved far
  // enough to be one. Snapping is off while dragging, or it would fight the
  // drag.
  const drag = useRef<{ pointerId: number; startY: number; startTop: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  // The latest value and onChange, for the wheel listener added once.
  const latest = useRef({ value, max, onChange });
  useEffect(() => {
    latest.current = { value, max, onChange };
  });

  const clamp = (index: number) => Math.min(max, Math.max(0, index));

  // Spins to the value when it's set from outside the scroll - the keys, the
  // mouse, a click, or opening at it.
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

  // The mouse wheel moves a number at a time rather than flinging past
  // several. Added by hand, as React's onWheel can't stop the page scrolling.
  useEffect(() => {
    const wheel = ref.current;
    if (!wheel || disabled) return;
    let pending = 0;
    let target: number | null = null;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { value: current, max: top, onChange: change } = latest.current;
      // Lines and pages, from some mice, as pixels.
      pending += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? wheel.clientHeight : 1);
      const steps = Math.trunc(pending / WHEEL_STEP_PX);
      if (steps === 0) return;
      pending -= steps * WHEEL_STEP_PX;
      // Counted from where the last step was headed, so quick notches each
      // move one even before the value they set comes back.
      const from = target ?? current;
      const next = Math.min(top, Math.max(0, from + steps));
      target = next;
      if (next !== current) change(next);
    };
    // Starts again from the value once the wheel has been still a moment.
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onWheelIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        target = null;
        pending = 0;
      }, 200);
    };
    wheel.addEventListener("wheel", onWheel, { passive: false });
    wheel.addEventListener("wheel", onWheelIdle, { passive: true });
    return () => {
      wheel.removeEventListener("wheel", onWheel);
      wheel.removeEventListener("wheel", onWheelIdle);
      clearTimeout(idle);
    };
  }, [disabled]);

  const onScroll = () => {
    // A drag settles when it's let go, not when it pauses.
    if (drag.current?.moved) return;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const wheel = ref.current;
      if (!wheel) return;
      const index = clamp(Math.round(wheel.scrollTop / ROW_PX));
      if (index !== value) onChange(index);
    }, SETTLE_MS);
  };

  // Mouse dragging - touch screens already scroll it by swiping.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !ref.current) return;
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startTop: ref.current.scrollTop, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const wheel = ref.current;
    if (!current || !wheel || event.pointerId !== current.pointerId) return;
    const distance = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.abs(distance) < DRAG_THRESHOLD_PX) return;
      current.moved = true;
      clearTimeout(settle.current);
      wheel.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    wheel.scrollTop = current.startTop - distance;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const wheel = ref.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    if (!current.moved || !wheel) return;
    setDragging(false);
    const index = clamp(Math.round(wheel.scrollTop / ROW_PX));
    // Lines the number up in the band, even when it's the one already chosen.
    wheel.scrollTo({ top: index * ROW_PX, behavior: "smooth" });
    if (index !== value) onChange(index);
    // So letting go over a number doesn't also click it.
    const swallowClick = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    wheel.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => wheel.removeEventListener("click", swallowClick, { capture: true }), 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    let next: number | undefined;
    if (event.key in steps) next = value + steps[event.key];
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`relative overflow-y-scroll overscroll-contain rounded-md [scrollbar-width:none] select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 [&::-webkit-scrollbar]:hidden ${
            dragging ? "cursor-grabbing" : "snap-y snap-mandatory cursor-grab"
          } ${disabled ? "pointer-events-none opacity-40" : ""}`}
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
