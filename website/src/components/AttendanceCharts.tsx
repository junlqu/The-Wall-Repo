"use client";

import { type ReactNode, useState } from "react";
import CountChart from "@/components/CountChart";
import ToggleSwitch from "@/components/ToggleSwitch";
import {
  type AttendanceDay,
  type AttendanceWeek,
  formatHourRange,
  formatMoney,
  hoursOf,
  measure,
  measureDay,
  type Metric,
  OPEN_DAYS,
  openDayOf,
  weekEndingFor,
} from "@/lib/attendance";
import { formatDate } from "@/lib/climbs";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// How much a chart covers, keyed "2026-10-30" (the week's Friday), "2026-10"
// or "2026". A week is shown whole, even when it runs into the next month.
export type Scale = "week" | "month" | "year";
type Period = { scale: Scale; key: string };

const SCALES: { id: Scale; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

// The period of `scale` that `date` falls in.
function periodOf(scale: Scale, date: string): Period {
  const key = scale === "year" ? date.slice(0, 4) : scale === "month" ? date.slice(0, 7) : weekEndingFor(date);
  return { scale, key };
}

function daysInPeriod(weeks: AttendanceWeek[], { scale, key }: Period): AttendanceDay[] {
  if (scale === "week") return weeks.find((week) => week.weekEnding === key)?.days ?? [];
  return weeks.flatMap((week) => week.days.filter((day) => day.date.startsWith(key)));
}

function describePeriod({ scale, key }: Period) {
  if (scale === "week") return `Week ending ${formatDate(key)}`;
  if (scale === "month") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return key;
}

// Three-way slider for the chart's scale. The white thumb slides under
// whichever is chosen.
function ScaleSlider({ scale, onChange }: { scale: Scale; onChange: (scale: Scale) => void }) {
  const index = SCALES.findIndex((item) => item.id === scale);
  return (
    <div role="tablist" aria-label="Period" className="relative flex w-44 rounded-md bg-neutral-200/70 p-0.5">
      <span
        aria-hidden="true"
        style={{ width: "calc((100% - 0.25rem) / 3)", transform: `translateX(${index * 100}%)` }}
        className="absolute inset-y-0.5 left-0.5 rounded bg-white shadow-sm transition-transform duration-200"
      />
      {SCALES.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === scale}
          onClick={() => onChange(item.id)}
          className={`relative flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
            item.id === scale ? "text-primary" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function formatter(metric: Metric, average: boolean) {
  if (metric === "earnings") return formatMoney;
  return average ? (count: number) => count.toFixed(1) : (count: number) => count.toLocaleString();
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ChartCard({
  title,
  subtitle,
  controls,
  loadingText,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  controls: ReactNode;
  loadingText?: string | null;
  children: ReactNode;
  className: string;
}) {
  return (
    <section aria-label={title} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{controls}</div>
      </div>
      <div className="mt-3">
        {loadingText ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// One bar per open day of the week, adding up every one of that day in the
// period - or, as an average, that total spread over the hours it was open.
export function DailyAttendanceChart({
  weeks,
  anchor,
  defaultScale = "year",
  metric,
  loadingText,
  className,
}: {
  weeks: AttendanceWeek[];
  // The Friday of the week the chart counts from - the slider shows that
  // week, or the month or year it ended in.
  anchor: string;
  defaultScale?: Scale;
  metric: Metric;
  loadingText?: string | null;
  className: string;
}) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const period = periodOf(scale, anchor);
  const [average, setAverage] = useState(false);
  const days = daysInPeriod(weeks, period);
  const format = formatter(metric, average);

  const counts = OPEN_DAYS.map((openDay) => {
    const ofDay = days.filter((day) => openDayOf(day.date)?.offset === openDay.offset);
    const total = ofDay.reduce((sum, day) => sum + measureDay(day, metric), 0);
    const hours = ofDay.reduce((sum, day) => sum + hoursOf(day).length, 0);
    return { label: openDay.short, count: average ? (hours === 0 ? 0 : total / hours) : total };
  });

  const what = metric === "numbers" ? "Climbers" : "Earnings";
  return (
    <ChartCard
      title={average ? `${what} per hour, by day` : `${what} per day`}
      subtitle={`${describePeriod(period)} · ${plural(days.length, "day")} recorded${average ? " · average per open hour" : ""}`}
      loadingText={loadingText}
      className={className}
      controls={
        <>
          <ToggleSwitch off="Total" on="Avg per hour" checked={average} onChange={setAverage} label="Show average per hour" />
          <ScaleSlider scale={scale} onChange={setScale} />
        </>
      }
    >
      <CountChart
        counts={counts}
        noun={(count) => (metric === "numbers" ? `${format(count)} climbers` : format(count))}
        formatCount={format}
        caption={`${what}${average ? " per hour" : ""} by day, ${describePeriod(period)}`}
        categoryHeader="Day"
        countHeader={what}
        emptyText="No attendance recorded for this period"
      />
    </ChartCard>
  );
}

// One bar per hour slot, adding up every weekend day or every weekday in the
// period. Weekends and weekdays keep different hours, so they're shown apart.
export function HourlyAttendanceChart({
  weeks,
  anchor,
  defaultScale = "year",
  metric,
  loadingText,
  className,
}: {
  weeks: AttendanceWeek[];
  // The Friday of the week the chart counts from - the slider shows that
  // week, or the month or year it ended in.
  anchor: string;
  defaultScale?: Scale;
  metric: Metric;
  loadingText?: string | null;
  className: string;
}) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const period = periodOf(scale, anchor);
  const [weekdays, setWeekdays] = useState(false);
  const days = daysInPeriod(weeks, period).filter((day) => openDayOf(day.date)?.weekend === !weekdays);
  const format = formatter(metric, false);

  // The schedule's hours, plus any others a day was recorded with.
  const hours = [
    ...new Set([
      ...OPEN_DAYS.filter((day) => day.weekend === !weekdays).flatMap((day) => day.hours),
      ...days.flatMap(hoursOf),
    ]),
  ].sort((a, b) => a - b);
  const counts = hours.map((hour) => ({
    label: formatHourRange(hour),
    count: days.reduce((sum, day) => {
      const counts = day.hours[String(hour)];
      return sum + (counts ? measure(counts, metric) : 0);
    }, 0),
  }));

  const what = metric === "numbers" ? "Climbers" : "Earnings";
  const group = weekdays ? "Weekdays" : "Weekends";
  return (
    <ChartCard
      title={`${what} per hour`}
      subtitle={`${group} · ${describePeriod(period)} · ${plural(days.length, "day")} recorded`}
      loadingText={loadingText}
      className={className}
      controls={
        <>
          <ToggleSwitch off="Weekends" on="Weekdays" checked={weekdays} onChange={setWeekdays} label="Show weekdays" />
          <ScaleSlider scale={scale} onChange={setScale} />
        </>
      }
    >
      <CountChart
        counts={counts}
        noun={(count) => (metric === "numbers" ? `${format(count)} climbers` : format(count))}
        formatCount={format}
        caption={`${what} per hour on ${group.toLowerCase()}, ${describePeriod(period)}`}
        categoryHeader="Hour"
        countHeader={what}
        emptyText={`No ${group.toLowerCase()} recorded for this period`}
        barClassName="min-w-16"
      />
    </ChartCard>
  );
}
